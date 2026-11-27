// The installation secret stays on this origin. The short-lived Worker token stays in memory.
window.crGuest = (() => {
  let session, boot;
  let pendingTeam = null;
  const enabled = () => window.API_CONFIG?.guestEnabled === true && !localStorage.getItem("CR_TOKEN");
  function seed() {
    let value = localStorage.getItem("CR_GUEST_INSTALL");
    if (!value) {
      value = Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,"0")).join("");
      localStorage.setItem("CR_GUEST_INSTALL",value);
    }
    return value;
  }
  async function bootstrap() {
    const install = navigator.locks ? await navigator.locks.request("cr-guest-install",seed) : seed();
    const response = await fetch(window.API_CONFIG.baseUrl+"/guest/session",{
      method:"POST", headers:{Authorization:"GuestSeed "+install}, cache:"no-store"
    });
    if (!response.ok) {
      const error = new Error(response.status === 429 ? "Troppe richieste. Riprova tra poco." :
        "Analisi gratuita momentaneamente non disponibile.");
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    if (!data.token) throw new Error("Accesso ospite non disponibile.");
    session = data;
    return session;
  }
  async function ready() {
    if (session && Number(session.token.split(".")[1])>Date.now()+30000) return session;
    if (!boot) boot = bootstrap().finally(()=>{boot=null});
    return boot;
  }
  function message(value) { document.getElementById("guestStatus").textContent=value; }
  function dismiss() {
    document.getElementById("guestInvite").hidden=true;
    pendingTeam=null;
  }
  function invite(team) {
    pendingTeam=team;
    const card=document.getElementById("guestInvite");
    card.hidden=false;
    card.querySelector("h3").focus();
  }
  function authComplete() {
    if (!session && !window.API_CONFIG?.guestEnabled) return;
    if (pendingTeam || session?.fixture) {
      sessionStorage.setItem("CR_RESUME_TEAM",JSON.stringify({
        team:pendingTeam, fixture:pendingTeam ? null : session.fixture, until:Date.now()+300000
      }));
    }
    location.reload(); // discard every panel cache and in-flight guest request
  }
  window.addEventListener("storage", e=>{
    if (["CR_TOKEN","CR_GUEST_INSTALL",null].includes(e.key)) location.reload();
  });
  document.addEventListener("DOMContentLoaded",async ()=>{
    const resume=sessionStorage.getItem("CR_RESUME_TEAM");
    sessionStorage.removeItem("CR_RESUME_TEAM");
    if (resume && localStorage.getItem("CR_TOKEN")) {
      const intent=JSON.parse(resume);
      if (intent.until>Date.now()) {
        if (intent.team) window.startTeamSearch(intent.team);
        else if (intent.fixture) window.selectFixtureDirect(intent.fixture);
      }
    }
    if (!enabled()) return;
    for (const id of ["guestRegister","guestLogin"]) {
      document.getElementById(id).onclick=()=>{
        openAuthModal(id==="guestLogin" ? "Accedi con il tuo account." : "Iscriviti gratis per iniziare la prova PRO.");
        document.getElementById("authEmail")?.focus();
      };
    }
    document.getElementById("guestBack").onclick=()=>{
      dismiss();
      const selection=window.CR_STATE?.selection;
      if (selection?.team) document.getElementById("teamSearchInput").value=selection.team.name;
      document.querySelector("#panelTabs .is-active")?.focus();
    };
    try {
      const data=await ready();
      if (!enabled()) return;
      if (!document.getElementById("guestStatus").textContent) message("La prima analisi è gratuita. Nessuna registrazione richiesta.");
      if (data.fixture && !window.CR_STATE.search.activeId && !window.crGuestSearching) window.crRenderGuestFixture(data.fixture);
    } catch (error) { message(error.message); }
  });
  function remember(fixture) { if (session) session.fixture=fixture; }
  return {enabled,ready,message,invite,dismiss,remember,authComplete};
})();
