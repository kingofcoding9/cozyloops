# cozyloops

## Custom order request email

The `/custom` page posts to `/api/custom-request`. The Worker validates the request, generates a branded PDF, and sends it through Cloudflare Email Service to `cochrankayce99@gmail.com`. The customer's email is set as the message reply-to address.

`wrangler.jsonc` contains an `EMAIL` send binding restricted to that destination. Configure `CUSTOM_REQUEST_FROM_EMAIL` to a sender address on a domain onboarded to Cloudflare Email Service.

The recipient is hard-coded server-side and also restricted by the binding, so the public endpoint cannot be used as an arbitrary mail relay.
