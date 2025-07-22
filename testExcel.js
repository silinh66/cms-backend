const { GoogleSpreadsheet } = require("google-spreadsheet");
require("dotenv").config();

// Initialize the sheet - doc ID is the long id in the sheets URL
// const doc = new GoogleSpreadsheet(
//   "1S9luDMy1lfRDDLf6VK37yWHr7RFjvwUDZC3dDtlGjbk"
// );

// // Initialize Auth - see more available options at https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication
// const excel = async () => {
//   await doc.useServiceAccountAuth({
//     client_email: "demo-619@excel-311402.iam.gserviceaccount.com",
//     private_key: "15d0f508e1c762af17ae611a98ced8e404d8fa67",
//   });

//   await doc.loadInfo(); // loads document properties and worksheets
//   console.log(doc.title);
//   await doc.updateProperties({ title: "renamed doc" });

//   const sheet = doc.sheetsByIndex[0]; // or use doc.sheetsById[id] or doc.sheetsByTitle[title]
//   console.log(sheet.title);
//   console.log(sheet.rowCount);

//   // adding / removing sheets
//   const newSheet = await doc.addSheet({ title: "hot new sheet!" });
//   await newSheet.delete();
// };

// excel();

const SPREADSHEET_ID = process.env.REACT_APP_SPREADSHEET_ID;
const SHEET_ID = process.env.REACT_APP_SHEET_ID;
const CLIENT_EMAIL = process.env.REACT_APP_GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.REACT_APP_GOOGLE_SERVICE_PRIVATE_KEY;

const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

const appendSpreadsheet = async (row) => {
  try {
    await doc.useServiceAccountAuth({
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    });
    // loads document properties and worksheets
    await doc.loadInfo();

    const sheet = doc.sheetsById[SHEET_ID];
    // const result = await sheet.addRow(row);
  } catch (e) {
    console.error("Error: ", e);
  }
};

const newRow = { Name: "new name", Value: "new value" };

appendSpreadsheet(newRow);
