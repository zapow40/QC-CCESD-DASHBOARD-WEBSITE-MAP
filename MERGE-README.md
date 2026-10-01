# QC CCESD Dashboard — Feature Merge

This package combines the newer Features Website application functionality with the QC-CCESD Dashboard branding shell.

## Preserved
- Existing QC-CCESD image/banner assets
- Existing icon set and visual identity/assets
- Existing page metadata and GitHub Pages deployment files
- Relative asset paths for repository/GitHub Pages deployment

## Added / carried over from the Features Website
- Public interactive Sensor Map (`/map`)
- Station selection and station detail panel
- Sensor positioning logic and saved latitude/longitude support
- Admin Sensor Map (`/admin/map`) for placing/editing sensor positions
- Admin Stations management
- Cleaner admin navigation/layout
- Network at a glance dashboard card
- City-wide average / monitoring-network summary
- Public map entry points and sensor-map call-to-actions
- Owner-only Team and Activity administration
- Backend API v6 support for sensor latitude/longitude
- Audit-log backend support

## Google Apps Script
`Code.gs` is the supplied Features Website backend (API version 6).

For an existing deployment, update the Apps Script project with this file and deploy a **new version** of the web app. The backend appends `latitude` and `longitude` to the stations table, so existing station columns are not shifted.

## Deployment
The static site remains suitable for GitHub Pages. Keep the repository base-path configuration used by the current QC deployment.

## Important
This is a production-build merge because the uploaded websites contain compiled/minified JavaScript rather than the original source tree. The feature application bundle is retained intact so the new sensor-map functionality is not accidentally broken by manual reconstruction.


## Google Apps Script Web App
The frontend API endpoint is configured to use the requested deployment:
`https://script.google.com/macros/s/AKfycbzL2BR9rmhdBESZS1SA1hYCVV43gMtV3fX8Ql4EcDoi_BENdODMDu7tDUn5WQC3ZoIBpA/exec`

If this deployment is replaced in Google Apps Script, update the `kv` constant in the compiled JavaScript accordingly.
