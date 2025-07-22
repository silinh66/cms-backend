const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
// const GoogleSpreadsheet = require('google-spreadsheet');
const { promisify } = require("util");

const scope = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
  "https://www.googleapis.com/auth/youtubepartner",
];
// const creds = require("./client_secret.json");
// const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

const authYoutube = async () => {
  //   await promisify(doc.useServiceAccountAuth)(creds);
  //   const info = await promisify(doc.getInfo)();
  //   const sheet = info.worksheets[0];
  //   const rows = await promisify(sheet.getRows)();
  //   const ids = rows.map((r) => r.id).join(",");

  fs.readFile("oauth-client-creds.json", (err, content) => {
    if (err) {
      return console.log("Cannot load client secret file:", err);
    }
    // Authorize a client with credentials, then make API call.
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scope,
    });

    console.log("authUrl: ", authUrl);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Enter the auth code from that URL: ", (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        oAuth2Client.setCredentials(token);
        callApi(oAuth2Client);
      });
    });
  });

  let callApi = (auth) => {
    const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth });
    youtubeAnalytics.reports
      .query({
        startDate: "2017-06-05",
        endDate: "2021-07-03",
        ids: "channel==MINE",
        filters: "video==RT-7DORV5m8",
        metrics:
          "estimatedRevenue,views,comments,likes,dislikes,estimatedMinutesWatched,averageViewDuration",
      })
      .then(async (response) => {
        console.log("estimatedRevenue", response.data.rows[0][0]);
        console.log("views", response.data.rows[0][1]);
        console.log("comments", response.data.rows[0][2]);
        console.log("likes", response.data.rows[0][3]);
        console.log("dislikes", response.data.rows[0][4]);
        console.log("estimatedMinutesWatched", response.data.rows[0][5]);
        console.log("averageViewDuration", response.data.rows[0][6]);
      })
      .catch((error) =>
        console.log("The API returned an error: ", error.message)
      );
  };
};
