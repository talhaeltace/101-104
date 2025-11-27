mkcert setup for local HTTPS (dev)

This project includes a PowerShell helper script to generate locally-trusted TLS certificates for the dev server using mkcert.

Why? Modern browsers require HTTPS for geolocation APIs on non-localhost origins. Generating a certificate that your machine trusts lets you open the site securely on LAN IPs like https://192.168.1.42:5173.

Steps (Windows / PowerShell):

1) Run the helper (as Administrator) from project root:

   powershell -ExecutionPolicy Bypass -File .\scripts\generate-mkcert.ps1

   - This script will try to install mkcert via Chocolatey if mkcert is not found.
   - It installs the local CA (mkcert -install) and generates certificates under `./certs/localhost.pem` and `./certs/localhost-key.pem`.

2) Start the dev server:

   npm run dev

   - If the certs exist, Vite will detect them and start HTTPS. The terminal will show https:// URLs for local and network addresses.

3) Open the https URL on your LAN device (e.g., https://10.1.110.19:5173).

Notes and troubleshooting:
- If your other devices (phone/tablet) still show the site as untrusted, those devices need to trust the mkcert CA (not covered by this script). For quick testing from other devices, use ngrok:

   ngrok http 5173

  ngrok provides a public HTTPS URL you can open on any device.

- If mkcert installation fails, install mkcert manually: https://github.com/FiloSottile/mkcert
- Do NOT commit the generated cert files to source control if this repo is shared. They are machine-specific.
