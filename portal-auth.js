
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./src/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const portal = location.pathname.endsWith("school.html")
  ? "school"
  : "teacher";

const style = document.createElement("style");
style.textContent = `
  .portal-auth-overlay {
    position:fixed; inset:0; z-index:99999;
    display:flex; align-items:center; justify-content:center;
    padding:20px; background:#f3f5f7;
    font-family:Arial,sans-serif;
  }
  .portal-auth-card {
    width:min(420px,100%); background:white;
    padding:34px; border-radius:18px;
    box-shadow:0 15px 45px #10233b18;
  }
  .portal-auth-card h2 { margin:0 0 8px; color:#142b49; }
  .portal-auth-card p { color:#687586; line-height:1.5; }
  .portal-auth-card input {
    width:100%; box-sizing:border-box; padding:13px;
    margin:8px 0; border:1px solid #d8dee7;
    border-radius:9px; font-size:15px;
  }
  .portal-auth-card button {
    width:100%; padding:14px; margin-top:12px;
    border:0; border-radius:9px; cursor:pointer;
    background:${portal === "school" ? "#c99b36" : "#168b78"};
    color:white; font-weight:700; font-size:15px;
  }
  .portal-auth-message { min-height:22px; font-size:13px; }
  .portal-auth-overlay[hidden] { display:none; }
  body.portal-locked .app { display:none !important; }
`;
document.head.appendChild(style);
document.body.classList.add("portal-locked");

const overlay = document.createElement("div");
overlay.className = "portal-auth-overlay";
overlay.innerHTML = `
  <div class="portal-auth-card">
    <h2>${portal === "school" ? "School Workspace" : "Teacher Workspace"}</h2>
    <p>Sign in with your approved ${portal} account to continue.</p>
    <form id="portalLoginForm">
      <input id="portalEmail" type="email" placeholder="Email address" required autocomplete="username">
      <input id="portalPassword" type="password" placeholder="Password" required autocomplete="current-password">
      <button id="portalLoginButton" type="submit">Sign In</button>
    </form>
    <p id="portalAuthMessage" class="portal-auth-message" role="status"></p>
  </div>
`;
document.body.appendChild(overlay);

const form = document.getElementById("portalLoginForm");
const message = document.getElementById("portalAuthMessage");
const loginButton = document.getElementById("portalLoginButton");

function showMessage(text) {
  message.textContent = text;
}

async function authorize(user) {
  if (!user) {
    document.body.classList.add("portal-locked");
    overlay.hidden = false;
    return;
  }

  let access = null;
  let displayName = "";

  if (portal === "school") {
    const { data, error } = await supabase
      .from("schools")
      .select("id, school_name, status")
      .eq("owner_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      showMessage("Unable to verify this school account. Please try again.");
      return;
    }

    access = data;
    displayName = data?.school_name || "";
  } else {
    const { data: independentTeacher, error: teacherError } = await supabase
      .from("teachers")
      .select("id, full_name, subject, school_id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (teacherError) {
      showMessage("Unable to verify this teacher account. Please try again.");
      return;
    }

    if (independentTeacher) {
      access = independentTeacher;
      displayName = independentTeacher.full_name || "";
    } else {
      const { data: schoolTeacher, error: staffError } = await supabase
        .from("school_staff")
        .select("id, school_id, full_name, position, account_status, status")
        .eq("user_id", user.id)
        .eq("account_status", "active")
        .eq("status", "active")
        .maybeSingle();

      if (staffError) {
        showMessage("Unable to verify this teacher account. Please try again.");
        return;
      }

      access = schoolTeacher;
      displayName = schoolTeacher?.full_name || "";
    }
  }

  if (!access) {
    showMessage("This account is not approved for this portal. Contact the relevant school or administrator.");
    return;
  }

  overlay.hidden = true;
  document.body.classList.remove("portal-locked");
  document.body.dataset.portalAuthorized = "true";

  window.dispatchEvent(new CustomEvent("portal:authorized", {
    detail: { portal, user, access, displayName }
  }));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";
  showMessage("");

  const { data, error } = await supabase.auth.signInWithPassword({
    email: document.getElementById("portalEmail").value.trim(),
    password: document.getElementById("portalPassword").value
  });

  loginButton.disabled = false;
  loginButton.textContent = "Sign In";

  if (error) {
    showMessage(error.message);
    return;
  }

  await authorize(data.user);
});

(async () => {
  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData.session) {
    await authorize(sessionData.session.user);
  } else {
    overlay.hidden = false;
  }
})();
supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    document.body.classList.add("portal-locked");
    overlay.hidden = false;
  }
});
