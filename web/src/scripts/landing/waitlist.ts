const form = document.querySelector<HTMLFormElement>("#waitlist-form");

if (form) {
  const status = document.getElementById("waitlist-status")!;
  const failure = "That did not go through. Try again.";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = new FormData(form).get("email");
    status.textContent = "Sending…";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        status.textContent = body.error ?? failure;
        return;
      }
      status.textContent = "You are on the list.";
      form.reset();
    } catch {
      status.textContent = failure;
    }
  });
}
