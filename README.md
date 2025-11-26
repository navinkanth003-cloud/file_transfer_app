# React + Vite
## Troubleshooting Connection Issues

If you can connect on the same PC but fail to connect between devices (e.g., PC to Mobile):

### 1. Windows Firewall (Most Likely Cause)
Windows Firewall often blocks the incoming connections required for WebRTC and the Signaling Server.
**Solution:**
1.  Open **Windows Security** > **Firewall & network protection**.
2.  Click **Allow an app through firewall**.
3.  Click **Change settings** (requires Admin).
4.  Find `Node.js JavaScript Runtime` (there might be multiple).
5.  Ensure **Private** and **Public** are checked for all of them.
6.  Click **OK**.

### 2. Network Isolation
Some Wi-Fi networks (especially public ones or guest networks) block devices from talking to each other.
**Solution:**
- Connect both devices to a **Mobile Hotspot** to test.
- Ensure "AP Isolation" is disabled in your router settings.

### 3. IP Address
Ensure you are entering the correct IP address of the PC on your mobile device.
- The app displays the available Network IPs in the terminal when you start the server.
- Example: `http://192.168.1.5:5173` (Frontend) and ensure the app connects to `http://192.168.1.5:3001` (Backend).

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
