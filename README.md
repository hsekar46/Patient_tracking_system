# Sarthak Upachar Kendra - Doctor Patient Tracker (Final)

Final MERN/local web application for Sarthak Upachar Kendra.

## Final changes included
- Clinic name, doctor name and clinic address can be changed from About / Settings.
- `Developed by Rakesh Poudel` is permanent and cannot be edited from Settings; the backend also enforces it.
- Reports are now year-based and monthly: January through December with Active Patients and Treatment Completed counts.
- Add Patient no longer has a Next Visit Type field. Next Visit and Follow-up Date remain available.
- Follow-up due today triggers a device/browser notification when notification permission is granted.
- Patient contact includes Call Patient using the device phone dialer (`tel:`).
- Treatment Completed retains completion date and Commented on Facebook Yes/No.
- Patient details keeps Patient Info, Visit History and Follow-up tabs.
- Local JSON storage; no external database required.

## Run
1. Install Node.js LTS.
2. Open this folder in VS Code terminal.
3. Run `npm run install-all`.
4. Run `npm run dev`.
5. Open the Vite URL shown by the terminal, normally `http://localhost:5173`.

Patient data: `backend/data/patients.json`.
Settings: `backend/data/settings.json`.
