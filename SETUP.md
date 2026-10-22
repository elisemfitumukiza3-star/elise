# LearnLoop — Full-stack starter

This project is a working front-end starter for an educational social network, designed to connect to Supabase for authentication, database, and private file storage.

## What is included

- Email/password sign-up and sign-in, session persistence, display names and profile bios
- Create educational posts with subject/type labels and file uploads
- Private Supabase Storage bucket for documents, images, and video (50 MB maximum per file)
- Feed that refreshes when posts change in the database
- Likes, comments, share links, and reposts with a reference to the original post
- Report posts for moderator review
- Free standard learning features; no user checkout or discount system
- Private, owner-only revenue preferences for limited ads, educational sponsorships, referral commissions, and voluntary support
- Public disclosure that sponsorships/referrals are labelled and personal information is not sold
- Row Level Security policies for profiles, posts, comments, reactions, reports, and uploads
- Responsive design for mobile, tablet, and desktop

## Important status

This is a starter implementation, not a hosted live service yet. It needs a Supabase project and a deployment account. No accounts, secrets, or hosting have been created for you. The public feed currently requires users to sign in; this is deliberate for the starter's privacy policy. You should test the security policies before opening registration publicly.

## 1. Create the Supabase backend

1. Create a project at https://supabase.com/.
2. Open **SQL Editor**, create a new query, paste the full contents of `supabase/schema.sql`, and run it.
3. Go to **Project Settings → API** and copy the Project URL and the publishable/anon key.
4. Copy `public/config.example.js` to `src/config.js`.
5. Replace the two placeholders in `src/config.js` with your project URL and publishable/anon key.
6. In Supabase **Authentication → URL Configuration**, set your local Site URL to `http://localhost:5173` while developing. Add your eventual production domain to the redirect URLs.
7. In **Authentication → Providers**, enable Email. Decide whether email confirmation is required; it is recommended for a public site.

**Security:** only use the publishable/anon key in the browser. Never use the `service_role` key or any secret key in `src/config.js` or any public file. Row Level Security (RLS) must remain enabled.

## 2. Run it on your computer

Install Node.js (LTS) from https://nodejs.org/ if you do not already have it.

From the project folder, run:

```bash
npm install
```

Create `src/config.js` as described above, then run:

```bash
npm run dev
```

Open the local URL shown by Vite, usually `http://localhost:5173`.

To check a production build:

```bash
npm run build
npm run preview
```

## 3. Publish it online (example: Netlify)

1. Upload this project to a private/public GitHub repository you control, excluding `.env`, private keys, and local configuration secrets. The Supabase publishable key is public by design, but your RLS policies protect data.
2. Create a Netlify site from that repository.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Make sure `src/config.js` is committed with your Supabase Project URL and publishable/anon key (both are intended for browser use). Alternatively, adjust the code to use build-time environment variables.
6. In Supabase Authentication URL Configuration, add your deployed domain, for example `https://your-site.netlify.app`, to Site URL / Redirect URLs.
7. Test signup, email confirmation, login, upload, download, comments, likes, reports, and mobile layout on the deployed site.

Alternative hosts include Vercel or Cloudflare Pages; use the same Vite build and `dist` output.

## 4. Moderator setup

The SQL schema includes a `moderators` table and policies. For a trusted moderator, create their account first, then add their auth UUID using the Supabase SQL Editor (replace the placeholder):

```sql
insert into public.moderators (user_id)
values ('REPLACE-WITH-TRUSTED-USER-UUID');
```

Only do this for people you trust. Moderator membership must be granted through the dashboard or a trusted server, never from the public browser. The starter supports reporting posts and moderator database permissions, but a complete moderation dashboard, audit trail, automated abuse detection, and appeal process are future work.

## 5. Before a public launch

- Review and test all RLS policies with separate normal-user and moderator accounts.
- Add rate limits / anti-spam protection and abuse monitoring.
- Add moderator tools to review reports and hide/remove posts.
- Add a privacy policy, terms of use, copyright/takedown process, and contact details.
- Add backup and retention policies; check video storage and bandwidth costs.
- Add stronger upload validation and malware scanning if the community accepts arbitrary documents.
- Consider age-appropriate safeguards and a process for urgent safety reports.
- Do not upload private documents or sensitive personal information.

## Known starter limitations

- Sharing uses a URL to the current page and a post anchor; direct public share pages are not implemented.
- Reposts copy the text and reference the original post, but file attachments are not duplicated.
- Saved resources and a following-only feed are placeholders.
- Moderation reports are recorded; the review dashboard is not included yet.
- Supabase Realtime is enabled for posts; comment and reaction counts refresh when users interact.
- A private bucket's signed URLs expire after 30 minutes; refresh/reload the feed if an old attachment link expires.


## Revenue and privacy notes

- User registration, standard posts, and ordinary learning features remain free. This update removes user payments and discounts from the starter.
- Host settings let the owner select preferred revenue methods and ad placement. They do **not** automatically connect an ad network, find sponsors, create referral agreements, or process voluntary contributions; those require separate approved provider/partner integrations and disclosures.
- Keep ads limited and clearly distinguish ads, sponsored content, and referral links from community posts. Never sell personal information. Collect only the data needed to run the service, set a retention policy, and review applicable Rwanda privacy and advertising requirements before launch.
- Test the owner and normal-user accounts separately. The host settings should return no access for ordinary users.
