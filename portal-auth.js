
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./src/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const portal = location.pathname.endsWith("school.html")
  ? "school"
  : "teacher";


const style = document.createElement("style");

style.textContent = `
  .portal-auth-overlay {
    --accent: ${portal === "school" ? "#e9b957" : "#35b99e"};
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: grid;
    grid-template-columns: 1fr 430px;
    align-items: center;
    gap: 60px;
    padding: 6%;
    overflow-y: auto;
    background:
      linear-gradient(90deg,rgba(3,15,29,.88),rgba(3,15,29,.48)),
      url("${portal === "school"
        ? "https://images.unsplash.com/photo-1562774053-701939374585?w=2000"
        : "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=2000"}")
      center/cover no-repeat;
    font-family: Arial, sans-serif;
  }

  .portal-auth-copy {
    color: white;
    max-width: 650px;
  }

  .portal-auth-brand {
    font-size: 30px;
    font-weight: 900;
    margin-bottom: 55px;
  }

  .portal-auth-brand span {
    color: var(--accent);
  }

  .portal-auth-copy small {
    color: var(--accent);
    font-weight: bold;
    letter-spacing: 3px;
  }

  .portal-auth-copy h1 {
    font-size: clamp(38px,5vw,65px);
    line-height: 1.08;
    margin: 20px 0;
  }

  .portal-auth-copy p {
    color: #e5edf5;
    font-size: 16px;
    line-height: 1.8;
    max-width: 520px;
  }

  .portal-auth-card {
    box-sizing: border-box;
    width: 100%;
    padding: 38px;
    border-radius: 22px;
    background: rgba(255,255,255,.96);
    box-shadow: 0 25px 80px #0006;
    color: #142b42;
  }

  .portal-auth-card h2 {
    font-size: 29px;
    margin: 12px 0;
  }

  .portal-auth-card p {
    color: #687586;
    line-height: 1.6;
  }

  .portal-auth-card label {
    display: block;
    margin: 18px 0 7px;
    font-size: 13px;
    font-weight: bold;
  }

  .portal-auth-card input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 15px;
    border: 1px solid #d8dee7;
    border-radius: 10px;
    font-size: 14px;
  }

  .portal-auth-card input:focus {
    outline: 2px solid var(--accent);
    border-color: var(--accent);
  }

  .portal-auth-card button {
    width: 100%;
    padding: 16px;
    margin-top: 24px;
    border: 0;
    border-radius: 10px;
    cursor: pointer;
    background: ${portal === "school" ? "#c99b36" : "#168b78"};
    color: white;
    font-weight: bold;
    font-size: 15px;
  }

  .portal-auth-message {
    min-height: 22px;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .portal-auth-overlay[hidden] {
    display: none;
  }

  body.portal-locked .app,
  body.portal-locked main,
  body.portal-locked .sidebar,
  body.portal-locked .portal-layout {
    visibility: hidden !important;
  }

  @media(max-width: 760px) {
    .portal-auth-overlay {
      grid-template-columns: 1fr;
      gap: 25px;
      padding: 25px 18px;
    }

    .portal-auth-brand {
      margin-bottom: 20px;
    }

    .portal-auth-copy h1 {
      font-size: 35px;
    }

    .portal-auth-card {
      max-width: 480px;
      margin: auto;
      padding: 27px;
    }
  }
`;

document.head.appendChild(style);

document.body.classList.add("portal-locked");

const overlay = document.createElement("div");
overlay.className = "portal-auth-overlay";

overlay.innerHTML = `
  <div class="portal-auth-copy">
    <div class="portal-auth-brand">LearnLoop<span>®</span></div>

    <small>
      ${portal === "school"
        ? "LEARNLOOP INSTITUTIONAL NETWORK"
        : "LEARNLOOP EDUCATION NETWORK"}
    </small>

    <h1>
      ${portal === "school"
        ? "Lead your institution. Shape the future."
        : "Teach with purpose. Inspire progress."}
    </h1>

    <p>
      ${portal === "school"
        ? "Manage your institution, empower educators and support every learner through one connected workspace."
        : "Manage your classes, lessons, assessments and student progress through one professional teaching workspace."}
    </p>
  </div>

  <section class="portal-auth-card">
    <h2>Welcome back</h2>
    <p>Sign in with your approved ${portal} account.</p>

    <form id="portalLoginForm">
      <label for="portalEmail">Email address</label>
      <input id="portalEmail" type="email"
        placeholder="Enter your email address"
        required autocomplete="username">

      <label for="portalPassword">Password</label>
      <input id="portalPassword" type="password"
        placeholder="Enter your password"
        required autocomplete="current-password">

      <button id="portalLoginButton" type="submit">
        Sign In
      </button>
    </form>

    <p id="portalAuthMessage"
       class="portal-auth-message"
       role="status"></p>

    <p style="text-align:center;font-size:11px">
      LearnLoop · LEARN • SHARE • GROW
    </p>
  </section>
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
     .from("teachers")
.select("id, school_name, email, location, logo_url, status")
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
    
     .from("schools")
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

   document.documentElement.dataset.portalAuthorized = "true";
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

// Always require credentials when entering a school or teacher portal.
document.body.classList.add("portal-locked");
overlay.hidden = false;

// Never grant portal access automatically from an existing session.
supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    document.body.classList.add("portal-locked");
    overlay.hidden = false;
  }
});
