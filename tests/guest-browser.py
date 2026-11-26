"""Local end-to-end test. Requires Chromium, Node 22.13+ and Python websockets."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

from websockets.sync.client import connect

ROOT = Path(__file__).resolve().parent
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class ChromeTab:
    def __init__(self, ws):
        self.ws = ws
        self.sequence = 0
        self.requests = []
        self.errors = []

    def command(self, method, params=None):
        self.sequence += 1
        self.ws.send(json.dumps(dict(id=self.sequence, method=method, params=params or {})))
        while True:
            event = json.loads(self.ws.recv(timeout=10))
            if event.get("method") == "Network.requestWillBeSent":
                self.requests.append(event["params"]["request"]["url"])
            if event.get("method") == "Runtime.exceptionThrown":
                self.errors.append(event["params"]["exceptionDetails"]["text"])
            if event.get("id") == self.sequence:
                if "error" in event:
                    raise RuntimeError(event["error"])
                return event["result"]

    def js(self, expression):
        result = self.command("Runtime.evaluate", dict(expression=expression, returnByValue=True))
        if "exceptionDetails" in result:
            raise AssertionError(result["exceptionDetails"])
        return result["result"].get("value")

    def wait(self, expression):
        for _ in range(100):
            if self.js(expression):
                return
            time.sleep(0.05)
        raise AssertionError((expression, self.js("document.body.innerText")))

    def click(self, selector):
        self.js(f"document.querySelector({json.dumps(selector)}).click()")

    def search(self, query, entry):
        self.js(f"document.querySelector('#teamSearchInput').value={json.dumps(query)}")
        if entry == "button":
            self.click("#btnSearch")
        elif entry == "enter":
            self.js("document.querySelector('#teamSearchInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
        else:
            self.js("document.querySelector('#teamSearchInput').dispatchEvent(new Event('input',{bubbles:true}))")
            self.wait("!!document.querySelector('#teamSuggestBox .suggestItem')")
            self.click("#teamSuggestBox .suggestItem")


def scenario(tab, width, height, entry):
    tab.command("Emulation.setDeviceMetricsOverride", dict(width=width,height=height,deviceScaleFactor=1,mobile=width<500))
    tab.js("localStorage.clear(); sessionStorage.clear()")
    tab.command("Page.reload")
    tab.wait("document.querySelector('#guestStatus')?.textContent.includes('Nessuna registrazione')")
    tab.search("Milan", entry)
    tab.wait("document.querySelector('#match')?.textContent.includes('AC Milan')")
    tab.command("Page.reload")
    tab.wait("document.querySelector('#guestStatus')?.textContent.includes('resta disponibile')")
    for view in ["predictionPanel","indicatorsPanel"]:
        tab.click('[data-view="'+view+'"]')
        tab.wait("document.querySelector('#crToast').innerText.includes('Sblocca con la prova gratuita')")
        assert tab.js("document.querySelector('#crToast').classList.contains('tPremium')")
        assert tab.js("document.querySelectorAll('#crToast .tPreviewItems li').length===3")
        assert tab.js("document.querySelector('#authModal').classList.contains('hidden')")
        assert tab.js("document.querySelector('.tab.is-active').dataset.view==='match'")
        assert tab.js("document.querySelector('#crToast [data-tcta]').getBoundingClientRect().height>=44")
        tab.click("[data-tclose]")
    tab.click('[data-view="predictionPanel"]')
    tab.click("[data-tcta]")
    tab.wait("!document.querySelector('#authModal').classList.contains('hidden')")
    tab.click("#btnCloseAuth")
    tab.wait("document.querySelector('#authModal').classList.contains('hidden')")
    tab.click('[data-view="standingsPanel"]')
    tab.search("Juventus", "enter")
    tab.wait("!document.querySelector('#guestInvite').hidden")
    assert tab.js("document.querySelector('#authModal').classList.contains('hidden')")
    assert tab.js("document.querySelector('#guestInvite').innerText.includes('Hai usato la tua prima analisi gratuita')")
    assert tab.js("document.querySelector('#guestRegister').classList.contains('proOfferCTA')")
    assert tab.js("document.querySelector('.tab.is-active').dataset.view") == "standingsPanel"
    assert tab.js("document.documentElement.scrollWidth <= innerWidth")
    assert tab.js("""Array.from(document.querySelectorAll('#guestInvite button')).every(button=>{
        const box=button.getBoundingClientRect();return box.width>0 && box.height>=44 && box.left>=0 && box.right<=innerWidth;
    })""")
    tab.click("#guestBack")
    tab.wait("document.querySelector('#teamSearchInput').value==='AC Milan'")
    tab.search("Juventus","button")
    tab.wait("!document.querySelector('#guestInvite').hidden")
    tab.click("#guestRegister")
    tab.wait("!document.querySelector('#authModal').classList.contains('hidden')")
    tab.js(f"document.querySelector('#authEmail').value='trial-{width}@example.test'")
    tab.js("document.querySelector('#authPass').value='synthetic-password'")
    tab.click("#btnRegister")
    tab.wait("document.querySelector('#match')?.textContent.includes('Juventus') && document.querySelector('#statusBadge').textContent.includes('PRO in prova')")
    assert not any("/predict?" in url or "/guest/players" in url for url in tab.requests)
    assert not tab.errors, tab.errors
    print(f"PASS {width}×{height}, {entry}, refresh, premium preview, cancel, register and resume", flush=True)


def main():
    chrome = os.environ.get("CHROMIUM") or shutil.which("chromium") or shutil.which("google-chrome")
    if not chrome:
        raise RuntimeError("Set CHROMIUM to a Chromium executable")
    with tempfile.TemporaryDirectory() as profile, socket.socket() as listener:
        listener.bind(("127.0.0.1",0))
        port = listener.getsockname()[1]
        listener.close()
        server = subprocess.Popen(["node",str(ROOT/"helpers/guest-server.mjs")],stdout=subprocess.PIPE,text=True)
        origin = server.stdout.readline().strip()
        browser = subprocess.Popen([chrome,"--headless","--disable-gpu","--no-sandbox","--disable-dev-shm-usage",
                                    "--disable-background-networking",f"--user-data-dir={profile}",
                                    f"--remote-debugging-port={port}",origin],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(200):
                try:
                    with HTTP.open(f"http://127.0.0.1:{port}/json/list",timeout=1) as result:
                        tabs = json.load(result)
                    page = next((t for t in tabs if t["type"]=="page" and t["url"].startswith(origin)),None)
                    if page:
                        break
                except OSError:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Isolated browser did not start")
            with connect(page["webSocketDebuggerUrl"]) as ws:
                tab=ChromeTab(ws)
                tab.command("Runtime.enable")
                tab.command("Network.enable")
                tab.command("Page.enable")
                tab.wait("document.readyState==='complete'")
                for args in [(1366,850,"button"),(390,844,"enter"),(375,812,"suggestion")]:
                    scenario(tab,*args)
        finally:
            browser.terminate()
            server.terminate()
            browser.wait()
            server.wait()


if __name__=="__main__":
    main()
