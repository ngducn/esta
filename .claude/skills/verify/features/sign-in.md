# Sign in

A family member types an email and a password on `/sign-in` and lands on `/` in their household. A wrong password gets one plain error that never says whether the address has an account. `/sign-up` creates an account: an email and a password, then a Vietnamese email with a 6-digit code and no link that confirms the address before the password is saved. `/forgot-password` emails a reset code and sets a new password with it. The code sign-in stays on `/sign-in/code`: type an email, receive a code, type it, land on `/`. A wrong code keeps them on the form with an error. An address that an admin invited lands in the inviting household with the invited role once its email is confirmed.

## Sub-features

- `sign-in-member` signs a seeded member in, with the code or the demo password, and shows their household on `/`.
- `sign-in-wrong-password` rejects a wrong password with the same error for a known and an unknown address, and creates no session.
- `sign-in-create-account` creates an account on `/sign-up`, confirms it with the code and lands on `/onboarding`.
- `sign-in-reset` resets a password on `/forgot-password` with the emailed code.
- `sign-in-wrong-code` rejects a wrong code, keeps the typed digits, and creates no session.
- `sign-in-invite-claim` signs an invited address in to the inviting household with the invited role.
- `sign-in-language` shows `/sign-in` in English when the visitor chose English.
- `sign-in-signed-in-redirect` sends a signed-in visitor from `/sign-in`, `/sign-in/code`, `/sign-up` and `/forgot-password` to `/`.

## How to get to it (user POV)

- Open any app page while signed out; the app redirects to `/sign-in`.
- Open `/sign-in` directly. Its links open `/sign-in/code` (`Đăng nhập bằng mã gửi qua email`), `/sign-up` (`Tạo tài khoản`) and `/forgot-password` (`Quên mật khẩu?`).
- Press the language switch (`English` or `Tiếng Việt`) on `/sign-in`.

## Driving it with the verify skill

Preconditions:

- The baseline in the index holds for your slot.
- For the invite claim, lane `n`'s admin has invited `invitee.lane<n>@demo.esta.test` (see [Onboarding](./onboarding.md), `onboarding-invite`).

- **Member.** Sign in as lane `n`'s mother. Run `$S/sign-in.sh me.lane<n>@demo.esta.test`, or `$S/sign-in.sh me.lane<n>@demo.esta.test --password` for the password path. It prints `browser on /`. `$S/b.sh js 'document.querySelector("h1").textContent'` prints `Gia đình Demo <n>`, and `$S/b.sh text` contains `Bạn đang đăng nhập với tên Nguyễn Thị Demo.` and `Quyền: Quản trị`.
- **Mail.** Check the mail the sign-in sent. Run `curl -s "http://127.0.0.1:$((54324 + 100 * ESTA_SLOT))/api/v1/search?query=to:%22me.lane<n>@demo.esta.test%22"`. One message has the subject `Mã đăng nhập Esta`. Its body holds one 6-digit code and no `http` link.
- **Wrong password.** Run `$S/sign-out.sh`, then `$S/b.sh fill 'input[name="email"]' me.lane<n>@demo.esta.test`, `$S/b.sh fill 'input[name="password"]' not-the-password` and `$S/b.sh click 'button[value="sign-in"]'`. The alert reads `Email hoặc mật khẩu chưa đúng. Kiểm tra lại rồi thử lại.`, the URL stays `/sign-in`, and the same text appears for an address with no account.
- **Create account.** Run `$S/sign-out.sh`, `$S/b.sh goto http://localhost:$((3000 + 100 * ESTA_SLOT))/sign-up`, fill `input[name="email"]` with `new.lane<n>@demo.esta.test` and `input[name="password"]` with 8 or more characters, then `$S/b.sh click 'button[value="send"]'`. Read the code with `node scripts/inbucket-code.ts new.lane<n>@demo.esta.test`, fill `input[name="code"]` and click `button[value="verify"]`. The browser lands on `/onboarding`.
- **Wrong code.** Run `$S/sign-out.sh` and `$S/b.sh goto http://localhost:$((3000 + 100 * ESTA_SLOT))/sign-in/code`, then `$S/b.sh fill 'input[name="email"]' me.lane<n>@demo.esta.test`, `$S/b.sh click 'button[value="send"]'`, `$S/b.sh wait 'input[name="code"]'`, `$S/b.sh fill 'input[name="code"]' 000000`, and `$S/b.sh click 'button[value="verify"]'`. Then `$S/b.sh wait '#code-error >> text=Mã không đúng'` succeeds, the error reads `Mã không đúng hoặc đã hết hạn. Gửi lại mã.`, the URL stays `/sign-in/code`, the code field still holds `000000`, and `$S/b.sh cookies | grep -c '"name": "sb-'` prints `0`.
- **Invite claim.** Run `$S/sign-in.sh invitee.lane<n>@demo.esta.test`. It prints `browser on /`. The heading is `Gia đình Demo <n>`, the page reads `Quyền: Chỉ xem`, and the `Mời người trong gia đình` link is absent. Confirm with `docker exec supabase_db_esta-$ESTA_SLOT psql -U postgres -tAc "select h.name, m.role, m.user_id is not null from household_members m join households h on h.id = m.household_id where m.invited_email = 'invitee.lane<n>@demo.esta.test'"`, which prints `Gia đình Demo <n>|viewer|t`.
- **Language.** Run `$S/sign-out.sh`, then `$S/set-locale.sh en`. The heading reads `Sign in`, the field reads `Password` and the link reads `Sign in with a code sent by email`. Run `$S/set-locale.sh vi` to return.
- **Signed-in redirect.** After a member sign-in, run `$S/b.sh goto http://localhost:$((3000 + 100 * ESTA_SLOT))/sign-in`. `$S/b.sh url` ends in `/`.
- **Proof.** Run `$S/evidence.sh <pr-id> <slug>` on the landing page and on the wrong-code error.

## Gotchas

- `/sign-in` sends a signed-in visitor to `/`. `sign-in.sh` signs out first; a hand-driven recipe runs `sign-out.sh` first.
- The session cookies are httpOnly, so `document.cookie` never shows them. Read them with `$S/b.sh cookies`.
- Session cookies are per host, not per port, so two slots in one browser overwrite each other's session. Keep one browser daemon per slot, which is the default.
- A code works once and expires in an hour. `sign-in.sh` clears the address's mail before it asks for a code, so an older code never wins.
- After a send, the resend button stays disabled for 60 s.
- Only lanes 1 to 10 are seeded. `me.lane13@` is a new user and lands on `/onboarding`.
- A signed-in member's saved locale wins over the `NEXT_LOCALE` cookie. `set-locale.sh` handles this.
- The first visit to a route compiles it in `next dev`, which can take a few seconds. `wait` on an element instead of sleeping.
