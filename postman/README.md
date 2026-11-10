# Resolve Postman demo

Import `Resolve.postman_collection.json` and `Resolve.postman_environment.json` into Postman.
Set `DEMO_ORDER_ID`, `DEMO_ORDER_EMAIL`, `CRON_SECRET`, and `CONSOLE_ACCESS_TOKEN` in the environment. If console auth is disabled, leave the last value empty. Run the folders in order while the app is running.

The collection is also mock-server friendly: create a Postman mock from the collection and point `baseUrl` at the mock URL for a no-credentials UI rehearsal. The webhook request intentionally demonstrates the unsigned response; a real PayPal delivery includes the verification headers and returns `200`.
