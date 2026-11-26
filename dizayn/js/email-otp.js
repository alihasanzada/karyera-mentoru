function startEmailOtp(form, { challenge, request, onVerified, onCancel }) {
  const input = form.querySelector("[name=code]");
  const verify = form.querySelector("[type=submit]");
  const resend = form.querySelector("[data-otp-resend]");
  const back = form.querySelector("[data-otp-back]");
  const error = form.querySelector("[data-otp-error]");
  const notice = form.querySelector("[data-otp-notice]");
  let resendAt = 0;
  let expiresAt = 0;
  let busy = false;
  let active = true;

  function timing(data) {
    const now = Date.now();
    resendAt = now + data.resend_after * 1000;
    expiresAt = now + data.expires_in * 1000;
  }

  function update() {
    form.setAttribute("aria-busy", String(busy));
    const expired = Date.now() >= expiresAt;
    const wait = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    verify.disabled = input.disabled = busy || expired;
    resend.disabled = busy || expired || wait > 0;
    back.disabled = busy;
    resend.textContent = wait && !expired ? `Yenidən göndər (${wait} san.)` : "Kodu yenidən göndər";
    if (expired && !error.textContent) error.textContent = "Kodun vaxtı bitib. Şifrə ilə yenidən daxil ol.";
  }

  function stop() {
    active = false;
    clearInterval(timer);
    input.value = "";
    form.setAttribute("aria-busy", "false");
    form.onsubmit = resend.onclick = back.onclick = null;
  }

  async function run(action) {
    if (busy || !active) return;
    busy = true;
    error.textContent = "";
    update();
    try {
      await action();
    } catch (err) {
      if (!active) return;
      if (err.status === 410) expiresAt = 0;
      if (err.status === 429 && err.retryAfter > 0) {
        resendAt = Math.max(resendAt, Date.now() + err.retryAfter * 1000);
      }
      error.textContent = err.message;
    } finally {
      busy = false;
      if (active) update();
    }
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    if (verify.disabled) return;
    const code = input.value.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      error.textContent = "Altı rəqəmli kodu daxil et.";
      input.focus();
      return;
    }
    input.value = "";
    return run(async () => {
      const user = await request("/api/auth/otp/verify", { code });
      if (!active) return;
      await onVerified(user);
      stop();
    });
  };

  resend.onclick = () => {
    if (resend.disabled) return;
    input.value = "";
    return run(async () => {
      const data = await request("/api/auth/otp/resend");
      if (!active) return;
      timing(data);
      notice.textContent = "Yeni kod göndərildi. Son məktubdakı kodu daxil et.";
    });
  };

  back.onclick = () => run(async () => {
    await request("/api/auth/otp/cancel");
    if (!active) return;
    stop();
    onCancel();
  });

  timing(challenge);
  error.textContent = "";
  notice.textContent = "";
  const timer = setInterval(update, 1000);
  update();
  input.focus();
  return stop;
}
