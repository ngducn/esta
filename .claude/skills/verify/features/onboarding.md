# Onboarding

A signed-in address with no household lands on `/onboarding`, names the household and itself, and becomes its admin. The next step invites family members by email with a role (admin, member, or viewer). An admin of an existing household reaches the same invite step from `/`.

## Sub-features

- `onboarding-create` creates a household for a new address and makes it the admin.
- `onboarding-validation` refuses an empty household name or display name with an inline error.
- `onboarding-invite` invites an address with a chosen role and confirms it in a status line.
- `onboarding-invite-duplicate` refuses to invite the same address twice.
- `onboarding-done` leaves the invite step for `/`.

## How to get to it (user POV)

- Sign in with an address that belongs to no household; the app opens `/onboarding`.
- As an admin on `/`, choose the `Mời người trong gia đình` link.

## Driving it with the verify skill

Preconditions:

- The baseline in the index holds for your slot.
- `new.lane<n>@demo.esta.test` has never signed in on this stack.

- **New address.** Run `$S/sign-in.sh new.lane<n>@demo.esta.test`. It prints `browser on /onboarding`, and the heading reads `Tạo gia đình`.
- **Validation.** Run `$S/b.sh click 'role=button[name="Tạo gia đình"]'` with both fields empty. `$S/b.sh wait 'text=Nhập tên gia đình.'` succeeds and the URL stays `/onboarding`.
- **Create.** Run `$S/b.sh fill 'input[name="householdName"]' 'Gia đình Mới Demo <n>'`, `$S/b.sh fill 'input[name="displayName"]' 'Demo Mới'`, and `$S/b.sh click 'role=button[name="Tạo gia đình"]'`. Then `$S/b.sh wait 'role=heading[name="Mời người trong gia đình"]'` succeeds.
- **Invite.** Run `$S/b.sh fill 'input[name="email"]' invitee.lane<n>@demo.esta.test`, `$S/b.sh click 'input[name="role"][value="viewer"]'`, and `$S/b.sh click 'role=button[name="Mời"s]'`. Then `$S/b.sh wait 'role=status >> text=Đã mời'` succeeds and the status reads `Đã mời invitee.lane<n>@demo.esta.test với quyền Chỉ xem.`
- **Duplicate.** The field clears after an invite, so retype it. Run `$S/b.sh fill 'input[name="email"]' invitee.lane<n>@demo.esta.test` and `$S/b.sh click 'role=button[name="Mời"s]'`. Then `$S/b.sh wait 'text=Email này đã được mời'` succeeds; the alert reads `Email này đã được mời hoặc đã là thành viên.`
- **Done.** Run `$S/b.sh click 'role=link[name="Xong"]'` and `$S/b.sh wait h1`. `$S/b.sh url` ends in `/`, and the heading is `Gia đình Mới Demo <n>`.
- **Stored state.** Run `docker exec supabase_db_esta-$ESTA_SLOT psql -U postgres -tAc "select h.name, m.invited_email, m.role from household_members m join households h on h.id = m.household_id where h.name = 'Gia đình Mới Demo <n>' order by m.invited_email"`. It prints two rows, `invitee.lane<n>@demo.esta.test|viewer` and `new.lane<n>@demo.esta.test|admin`, after the household name.
- **Invite from a seeded household.** Run `$S/sign-in.sh me.lane<n>@demo.esta.test`, then `$S/b.sh click 'role=link[name="Mời người trong gia đình"]'`, and invite as above. The invitee then claims it per [Sign in](./sign-in.md), `sign-in-invite-claim`.
- **Proof.** Run `$S/evidence.sh <pr-id> <slug>` on the invite status and on `/` after `Xong`.

## Gotchas

- The create form has a language switch button too, so a bare `button[type="submit"]` matches two elements. Use the `role=` selector with the name.
- `role=button[name="Mời"]` without the trailing `s` also matches longer names that contain `Mời`.
- After a successful invite the email field clears. Choosing `Mời` again without retyping reports `Email chưa đúng. Kiểm tra lại rồi thử lại.`, which is the empty-field error, not the duplicate one.
- A new address keeps its household across reruns on the same stack. Run `launch.sh` again to reseed, or use a new suffix.
