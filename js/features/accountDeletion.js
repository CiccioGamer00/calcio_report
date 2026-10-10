// Separate account action: preserves login/logout, badges and PRO interactions.
function setupAccountDeletion() {
  const open = document.getElementById("btnOpenDeleteAccount");
  const modal = document.getElementById("deleteAccountModal");
  const form = document.getElementById("deleteAccountForm");
  const password = document.getElementById("deleteAccountPassword");
  const confirmation = document.getElementById("deleteAccountConfirmation");
  const message = document.getElementById("deleteAccountMessage");
  const submit = document.getElementById("btnConfirmDeleteAccount");
  const cancel = document.getElementById("btnCancelDeleteAccount");
  if (!open || !modal || !form) return;
  let busy = false;
  const close = () => {
    if (busy) return;
    form.reset();
    message.textContent = "";
    modal.classList.add("hidden");
    open.focus();
  };
  open.addEventListener("click", () => {
    form.reset();
    message.textContent = "";
    modal.classList.remove("hidden");
    password.focus();
  });
  cancel.addEventListener("click", close);
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Tab") {
      if (event.shiftKey && document.activeElement === password) {
        event.preventDefault(); cancel.focus();
      } else if (!event.shiftKey && document.activeElement === cancel) {
        event.preventDefault(); password.focus();
      }
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!password.value || confirmation.value !== "ELIMINA") {
      message.textContent = "Inserisci la password e scrivi ELIMINA per confermare.";
      return;
    }
    busy = true;
    submit.disabled = cancel.disabled = true;
    message.textContent = "Cancellazione in corso…";
    try {
      const response = await fetch(window.API_CONFIG.baseUrl + "/auth/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ password: password.value, confirmation: confirmation.value }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok === true) {
        form.reset();
        forceLogout("Account cancellato definitivamente.");
        return;
      }
      message.textContent = authErrorMessage(
        { status: response.status, json: data },
        "Cancellazione non completata. Riprova più tardi.",
      );
    } catch {
      message.textContent = "Esito non verificabile: controlla la connessione e prova ad accedere nuovamente prima di ripetere la cancellazione.";
    } finally {
      password.value = "";
      busy = false;
      submit.disabled = cancel.disabled = false;
    }
  });
}
