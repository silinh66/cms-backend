// Load environment variables
require("dotenv").config({ path: "./config.env" });

var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var mysql = require("mysql");
var cors = require("cors");
// var authYoutube = require("./test");

const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const multer = require("multer");
// const GoogleSpreadsheet = require('google-spreadsheet');
const { promisify } = require("util");
// Set up Google authentication with the necessary scopes for Google Docs
const auth = new google.auth.GoogleAuth({
  keyFile: "./google.json", // Path to your JSON key file
  scopes: ["https://www.googleapis.com/auth/documents"], // Scope for Google Docs
});

// Function to write to a Google Docs document
async function writeGoogleDocs(documentId, requests) {
  try {
    const docs = google.docs({ version: "v1", auth }); // Create a Google Docs API client

    // Send a batchUpdate request to modify the document
    const writer = await docs.documents.batchUpdate({
      documentId, // ID of the document to update
      requestBody: {
        requests, // Array of requests detailing the changes to be made
      },
    });
    return writer; // Return the response from the Google Docs API
  } catch (error) {
    console.error("error", error); // Log any errors that occur
  }
}

function extractGoogleDocID(url) {
  // This pattern is adjusted to match URLs that may not have a trailing '/'
  const pattern = /\/d\/([a-zA-Z0-9-_]+)/;
  const match = url.match(pattern);

  if (match && match[1]) {
    // If a match is found, return the ID part
    return match[1];
  } else {
    // If no match is found, return null or an appropriate message
    return null; // or "Invalid URL"
  }
}

// Function to read from a Google Docs document
async function readGoogleDocs(documentId) {
  try {
    const docs = google.docs({ version: "v1", auth }); // Create a Google Docs API client

    // Retrieve the document content
    const response = await docs.documents.get({ documentId }); // ID of the document to read
    return response.data; // Return the document data
  } catch (error) {
    console.error("Error reading Google Doc:", error); // Log any errors that occur
    throw error; // Re-throw error để caller có thể xử lý
  }
}

function countWords(text) {
  // Kiểm tra nếu text rỗng hoặc null
  if (!text || typeof text !== "string") {
    return 0;
  }

  // Xóa các ký tự không cần thiết và tách chuỗi thành mảng dựa vào khoảng trắng
  const words = text
    .trim()
    .replace(/\s{2,}/g, " ")
    .split(/\s+/);

  // Trả về số lượng từ (nếu text chỉ có khoảng trắng thì trả về 0)
  return words.length === 1 && words[0] === "" ? 0 : words.length;
}

function extractAllText(content) {
  if (!content || !Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((d) => d.paragraph?.elements || [])
    .map((element) => element.textRun?.content || "")
    .join("");
}

var cron = require("node-cron");
const { default: axios } = require("axios");
const { map, includes, get, isEmpty } = require("lodash");
const moment = require("moment");
const KEY =
  process.env.GOOGLE_API_KEY || "AIzaSyCVcmoOusyx6ZsSrAHag5DJ-ohVQ3YyDVQ";

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  "8220622923:AAEvSBn2XE4EzdbHRMTVY1gjnYw3H0OcklE";

// Mapping tên kênh <-> Telegram group ID
const TELEGRAM_GROUPS = {
  "Vẹt tiếng Anh": "-4941167429", // Chat ID thực của nhóm Vẹt tiếng Anh
  "Vẹt tiếng Việt": "-4810669846", // Thêm các kênh khác khi cần
  "Mèo tiếng Anh": "-4977709258",
  "Mèo tiếng Việt": "-4807719060",
  "Sư tử tiếng Anh": "-4967418133",
  "Sư tử tiếng Việt": "-4858380052",
  "Trứng tiếng Anh": "-4830604524",
  "Trứng tiếng Việt": "-4937315659",
  "Lửng tiếng Anh": "-4855405357",
  "Lửng tiếng Việt": "-4904188895",
};

// Hàm lấy username Telegram từ CMS name
async function getTelegramUsername(cmsName) {
  try {
    // Lấy dữ liệu từ Google Sheets
    const response = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/1xEHFgkYpCFP_hsMTjjb2h5Sl5poJW_heh7fq91k1AyU/values:batchGet?ranges=Sheet2&majorDimension=ROWS&key=${
        process.env.GOOGLE_SHEETS_API_KEY ||
        "AIzaSyByXzekuWCb4pI-ZTD7yEAGVYV0224Mc6Q"
      }`
    );

    if (
      !response.data ||
      !response.data.valueRanges ||
      !response.data.valueRanges[0] ||
      !response.data.valueRanges[0].values
    ) {
      return null;
    }

    const data = response.data.valueRanges[0].values;

    // Tìm user có CMS name trùng khớp (cột AI)
    for (let i = 1; i < data.length; i++) {
      const userCmsName = data[i][fixUserColumn.cms]; // Cột AI - CMS
      if (userCmsName && userCmsName.toLowerCase() === cmsName.toLowerCase()) {
        // Lấy username Telegram từ cột AJ - Nickname của cùng dòng đó
        const telegramUsername = data[i][fixUserColumn.nickname]; // Cột AJ - Nickname
        return telegramUsername
          ? `@${telegramUsername.replace("@", "")}`
          : null;
      }
    }

    return null;
  } catch (error) {
    console.error("Lỗi lấy username Telegram:", error);
    return null;
  }
}

// Hàm parse activity message để tìm người được thay đổi thành
async function parseActivityForMentions(activityText) {
  const mentionedUsers = [];

  try {
    // Pattern để tìm "thành [tên]" trong activity
    const patterns = [
      /thành\s+([^\s]+(?:\s+[^\s]+)*)/gi, // "thành 7 Huy", "thành 2 Tạ Quang Chiến"
      /Thành\s+([^\s]+(?:\s+[^\s]+)*)/gi, // "Thành 7 Huy"
      /thành\s+(\d+\s+[^\s]+(?:\s+[^\s]+)*)/gi, // "thành 2 Tạ Quang Chiến"
      /Thành\s+(\d+\s+[^\s]+(?:\s+[^\s]+)*)/gi, // "Thành 2 Tạ Quang Chiến"
    ];

    for (const pattern of patterns) {
      const matches = activityText.match(pattern);
      if (matches) {
        for (const match of matches) {
          // Lấy tên sau "thành"
          const nameMatch = match.match(/thành\s+(.+)/i);
          if (nameMatch) {
            const cmsName = nameMatch[1].trim();
            console.log(`Tìm thấy CMS name trong activity: ${cmsName}`);

            // Lấy Telegram username cho CMS name này
            const telegramUsername = await getTelegramUsername(cmsName);
            if (telegramUsername) {
              mentionedUsers.push(telegramUsername);
              console.log(
                `Đã thêm Telegram username: ${telegramUsername} cho ${cmsName}`
              );
            } else {
              console.log(`Không tìm thấy Telegram username cho: ${cmsName}`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Lỗi parse activity cho mentions:", error);
  }

  return mentionedUsers;
}

// Hàm gửi thông báo Telegram
async function sendTelegramNotification(
  channelName,
  message,
  mentionedUsers = []
) {
  const groupId = TELEGRAM_GROUPS[channelName];
  if (!groupId) {
    console.log(`Không tìm thấy Telegram group cho kênh: ${channelName}`);
    return;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Thiếu Telegram Bot Token");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  // Thêm tag người dùng vào cuối message nếu có
  let finalMessage = message;
  if (mentionedUsers.length > 0) {
    finalMessage += `\n\n👥 <b>Tag:</b> ${mentionedUsers.join(" ")}`;
  }

  try {
    const response = await axios.post(url, {
      chat_id: groupId,
      text: finalMessage,
      parse_mode: "HTML",
    });
    console.log(
      `Đã gửi thông báo Telegram thành công cho kênh: ${channelName}`
    );
  } catch (err) {
    console.error(
      "Lỗi gửi thông báo Telegram:",
      err?.response?.data || err.message
    );
  }
}

// API để test và lấy chat_id của Telegram group
app.post("/api/telegram/test", async function (req, res) {
  const { channelName, message, mentionedUsers } = req.body;

  if (!channelName || !message) {
    return res.status(400).send({
      error: true,
      message: "Please provide channelName and message",
    });
  }

  try {
    await sendTelegramNotification(channelName, message, mentionedUsers || []);
    res.send({
      error: false,
      message: `Đã gửi thông báo test cho kênh: ${channelName}`,
    });
  } catch (error) {
    res.status(500).send({
      error: true,
      message: "Lỗi gửi thông báo Telegram",
      details: error.message,
    });
  }
});

// API để lấy thông tin chat của Telegram group
app.get("/api/telegram/get-updates", async function (req, res) {
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(400).send({
      error: true,
      message: "Thiếu Telegram Bot Token",
    });
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    const response = await axios.get(url);

    res.send({
      error: false,
      data: response.data,
      message: "Lấy thông tin updates thành công",
    });
  } catch (error) {
    res.status(500).send({
      error: true,
      message: "Lỗi lấy thông tin updates",
      details: error.message,
    });
  }
});
const fixUserColumn = {
  id: 0,
  name: 1,
  status: 2,
  type: 3,
  userName: 4,
  password: 5,
  admin: 6,
  cm: 7,
  cw: 8,
  am: 9,
  ac: 10,
  vm: 11,
  ve: 12,
  other: 13,
  tenTickers: 14,
  tenMovie: 15,
  tenAsia: 16,
  tenTun: 17,
  tenAnime: 18,
  tlsq: 19,
  tenKpop: 20,
  entertainment: 21,
  kaTun: 22,
  tenTen: 23,
  animeCN: 24,
  // beginDate: 23,
  // cms: 24,
  // nickname: 25,
  // dob: 26,
  // email: 27,
  // phone: 28,
  // bank: 29,
  // bankNumber: 30,
  // bankNote: 31,
  // note: 32,
  // luongCung: 33,
  // donGiaScrip1k: 34,
  // donGiaScrip2k: 35,
  // donGiaScrip3k: 36,
  // donGiaScrip4k: 37,
  // donGiaScrip5k: 38,
  // donGiaAudio: 39,
  // donGiaAudio2k: 40,
  // donGiaAudio3k: 41,
  // donGiaAudio4k: 42,
  // donGiaAudio5k: 43,
  // donGiaVideo1k: 44,
  // donGiaVideo2k: 45,
  // donGiaVideo3k: 46,
  // donGiaVideo4k: 47,
  // donGiaVideo5k: 48,
  beginDate: 33,
  cms: 34,
  nickname: 35,
  dob: 36,
  email: 37,
  phone: 38,
  bank: 39,
  bankNumber: 40,
  bankNote: 41,
  note: 42,
  luongCung: 43,
  donGiaScrip1k: 44,
  donGiaScrip2k: 45,
  donGiaScrip3k: 46,
  donGiaScrip4k: 47,
  donGiaScrip5k: 48,
  donGiaAudio: 49,
  donGiaAudio2k: 50,
  donGiaAudio3k: 51,
  donGiaAudio4k: 52,
  donGiaAudio5k: 53,
  donGiaVideo1k: 54,
  donGiaVideo2k: 55,
  donGiaVideo3k: 56,
  donGiaVideo4k: 57,
  donGiaVideo5k: 58,
};

const scope = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
  "https://www.googleapis.com/auth/youtubepartner",
];

var monthNow = +moment().subtract(0, "months").format("MM");
var monthNowString = moment().subtract(0, "months").format("YYYYMM");
// var monthNow = +moment().format("MM");
// var monthNowString = moment().format("YYYYMM");
var yearNow = +moment().format("YYYY");

console.log("monthNow", monthNow);
console.log("monthNowString", monthNowString);
console.log("yearNow", yearNow);

var oAuth2Client, authUrl, callApi;

fs.readFile("oauth-client-creds.json", (err, content) => {
  if (err) {
    return console.log("Cannot load client secret file:", err);
  }
  // Authorize a client with credentials, then make API call.
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scope,
    prompt: "consent",
  });
});

function YouTubeGetID(url) {
  var ID = "";
  url = url
    .replace(/(>|<)/gi, "")
    .split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/)/);
  if (url[2] !== undefined) {
    ID = url[2].split(/[^0-9a-z_\-]/i);
    ID = ID[0];
  } else {
    ID = url;
  }
  return ID;
}

const getChannelId = async (auth) => {
  var getChannelIdResponse = [];
  const youtubeChannelId = google.youtube({ version: "v3", auth });
  await youtubeChannelId.channels
    .list({
      part: "snippet,contentDetails,statistics",
      mine: "true",
    })
    .then((response) => {
      console.log("response in getChannelId", response.data.items[0]);
      getChannelIdResponse = response.data.items[0].id;
    })
    .catch((error) => console.log("The API returned an error: ", error));
  return getChannelIdResponse;
};

callApi = async (auth, videoIds) => {
  // console.log("videoIds", videoIds);
  var yapiResponse = [];
  if (videoIds.length > 0) {
    const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth });
    for (let i = 0; i < videoIds.length; i++) {
      await youtubeAnalytics.reports
        .query({
          startDate: "2021-06-01",
          endDate: "2021-06-30",
          ids: "channel==MINE",
          filters: `video==${videoIds[i]}`,
          // dimensions: 'ageGroup,gender',
          metrics:
            "estimatedRevenue,views,comments,likes,dislikes,estimatedMinutesWatched,averageViewDuration,annotationClickThroughRate,subscribersGained,subscribersLost,redViews,shares,averageViewPercentage",
        })
        .then(async (response) => {
          yapiResponse = [...yapiResponse, response.data.rows];
        })
        .catch((error) => console.log("The API returned an error: ", error));
    }
  } else {
    const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth });
    await youtubeAnalytics.reports
      .query({
        startDate: "2021-06-01",
        endDate: "2021-06-30",
        ids: "channel==MINE",
        // filters: "video==tZ1TgcwRb_0",
        // dimensions: 'ageGroup,gender',
        metrics:
          "estimatedRevenue,views,comments,likes,dislikes,estimatedMinutesWatched,averageViewDuration,annotationClickThroughRate,subscribersGained,subscribersLost,redViews,shares,averageViewPercentage",
      })
      .then(async (response) => {
        // console.log("estimatedRevenue", response.data.rows[0][0]);
        // console.log("views", response.data.rows[0][1]);
        // console.log("comments", response.data.rows[0][2]);
        // console.log("likes", response.data.rows[0][3]);
        // console.log("dislikes", response.data.rows[0][4]);
        // console.log("estimatedMinutesWatched", response.data.rows[0][5]);
        // console.log("averageViewDuration", response.data.rows[0][6]);
        yapiResponse = response.data.rows;
      })
      .catch((error) => console.log("The API returned an error: ", error));
  }
  // console.log("yapiResponse", yapiResponse);
  return yapiResponse;
};

var isProduct = true;

let minutes_update_report = isProduct ? 60 : 5000; //time to run cron task (minutes)

//dev

var whitelist = [
  "http://103.116.9.100:3001",
  "https://103.116.9.100:3001",
  "http://ebemedia.com",
  "https://ebemedia.com",
  "https://dautubenvung.com",
  "https://cms.zoozoostudio.com",
  "https://cms.zoozoostudio.com/",
];
var corsOptions = {
  origin: function (origin, callback) {
    console.log("origin: ", origin);
    if (whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

// Ensure CORS middleware is first in the chain to avoid CORS errors
app.use(cors(isProduct ? corsOptions : { origin: "http://localhost:3001" }));

// Increase body parser limits for large file uploads
app.use(bodyParser.json({ limit: "4gb", type: "application/json" }));
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "4gb",
  })
);

// Setup other middleware after CORS
app.all("*", function (req, res, next) {
  /**
   * Response settings
   * @type {Object}
   */
  var responseSettings = {
    AccessControlAllowOrigin: req.headers.origin,
    AccessControlAllowHeaders:
      "Content-Type,X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5,  Date, X-Api-Version, X-File-Name",
    AccessControlAllowMethods: "POST, GET, PUT, DELETE, OPTIONS",
    AccessControlAllowCredentials: true,
  };

  /**
   * Headers
   */
  res.header(
    "Access-Control-Allow-Credentials",
    responseSettings.AccessControlAllowCredentials
  );
  res.header(
    "Access-Control-Allow-Origin",
    responseSettings.AccessControlAllowOrigin
  );
  res.header(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"]
      ? req.headers["access-control-request-headers"]
      : "x-requested-with"
  );
  res.header(
    "Access-Control-Allow-Methods",
    req.headers["access-control-request-method"]
      ? req.headers["access-control-request-method"]
      : responseSettings.AccessControlAllowMethods
  );

  if ("OPTIONS" == req.method) {
    res.send(200);
  } else {
    next();
  }
});

app.get("/api", function (req, res) {
  return res.send({ error: false, message: "hello Linh Ken" });
});

const PORT = process.env.PORT || 3000;

// Create server with timeout config
const server = app.listen(PORT, function () {
  console.log("Node app is running on port " + PORT);
});

// Set server timeout to 30 minutes for large file uploads
server.timeout = 1800000;

// Đọc thông tin OAuth từ file cấu hình
let CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REFRESH_TOKEN;
try {
  const oauthConfig = JSON.parse(
    fs.readFileSync("./oauth-config.json", "utf8")
  );
  CLIENT_ID = oauthConfig.client_id;
  CLIENT_SECRET = oauthConfig.client_secret;
  REDIRECT_URI = oauthConfig.redirect_uri;
  REFRESH_TOKEN = oauthConfig.refresh_token;
  console.log("OAuth configuration loaded successfully");
} catch (error) {
  console.error("Error loading OAuth configuration:", error);
  console.error(
    "Please create oauth-config.json file based on oauth-config.example.json"
  );
  // Sử dụng giá trị mặc định nếu không đọc được file (chỉ dùng cho môi trường phát triển)
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "Using placeholder OAuth credentials. DO NOT USE IN PRODUCTION!"
    );
    CLIENT_ID = "YOUR_CLIENT_ID_HERE";
    CLIENT_SECRET = "YOUR_CLIENT_SECRET_HERE";
    REDIRECT_URI = "http://localhost:3000/oauth2callback";
    REFRESH_TOKEN = "YOUR_REFRESH_TOKEN_HERE";
  } else {
    process.exit(1); // Exit in production if config is missing
  }
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 4 * 1024 * 1024 * 1024, // 4GB
    fieldSize: 4 * 1024 * 1024 * 1024, // 4GB for form fields
  },
});

// Cập nhật mapping giữa kênh và folder ID
const channelFolderMap = {
  "Vẹt tiếng Anh": "1WGYgWXVvYRGlkk5gvM39qT_ad1P7EBPz",
  "Vẹt tiếng Việt": "1sssMAA7NUY5rlERH7flXr1xO3DwlObUv",
  "Mèo tiếng Anh": "1Dv-dZl9DXfGVCfXD0Sw5zgVmivLGsdWb",
  "Mèo tiếng Việt": "1uXn0JaDBiZPVwwa384E6qdVNaVl56tih",
  "Sư tử tiếng Anh": "1r5xHQYJ_DmaquxOKaWT0T9G87KNKN3dB",
  "Sư tử tiếng Việt": "1U_fo4I7TjKy9ovGek2pY6BqjhsWQK7nd",
  "Trứng tiếng Anh": "1Au45jSX3hSHiKQEW-woUsCoq2zgiqcbp",
  "Trứng tiếng Việt": "FOLDER_ID_TRUNG_VIET",
  "Lửng tiếng Anh": "1wcLeg-EoIF_zob8ydHsl2nB8QTYr7vrN",
  "Lửng tiếng Việt": "1HN0WGsHNPvnn2ZuA_jftbxLp6ojZUYIE",
};

// Giả lập phân quyền user → folder
// const userFolderMap = {
//   userA: "1rZXSJPyUWTq9_V46eBbbyYKzeNNsKyg6",
//   userB: "FOLDER_ID_2",
// };

// Truy xuất thông tin phân quyền người dùng từ bảng Sheet2
const getUserChannels = async (username) => {
  console.log("username: ", username);
  try {
    const response = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/1xEHFgkYpCFP_hsMTjjb2h5Sl5poJW_heh7fq91k1AyU/values:batchGet?ranges=Sheet2&majorDimension=ROWS&key=${
        process.env.GOOGLE_SHEETS_API_KEY ||
        "AIzaSyByXzekuWCb4pI-ZTD7yEAGVYV0224Mc6Q"
      }`
    );

    if (
      !response.data ||
      !response.data.valueRanges ||
      !response.data.valueRanges[0] ||
      !response.data.valueRanges[0].values
    ) {
      return [];
    }

    const data = response.data.valueRanges[0].values;
    let userIndex = -1;

    // Tìm index của người dùng
    for (let i = 1; i < data.length; i++) {
      if (data[i][fixUserColumn.userName] === username) {
        userIndex = i;
        break;
      }
    }

    if (userIndex === -1) {
      return [];
    }

    // Lấy thông tin các kênh được phân quyền
    const userChannels = [];
    for (let i = fixUserColumn.tenTickers; i < data[0].length; i++) {
      if (data[userIndex][i] === "1" && data[0][i]) {
        let channelName = data[0][i];
        // Ánh xạ tên kênh từ Sheet sang tên folder trên Google Drive
        let folderName;
        console.log("channelName: ", channelName);
        switch (channelName) {
          case "Vẹt tiếng Anh":
            folderName = "Vẹt tiếng Anh";
            break;
          case "Vẹt tiếng Việt":
            folderName = "Vẹt tiếng Việt";
            break;
          case "Mèo tiếng Anh":
            folderName = "Mèo tiếng Anh";
            break;
          case "Mèo tiếng Việt":
            folderName = "Mèo tiếng Việt";
            break;
          case "Sư tử tiếng Anh":
            folderName = "Sư tử tiếng Anh";
            break;
          case "Sư tử tiếng Việt":
            folderName = "Sư tử tiếng Việt";
            break;
          case "Trứng tiếng Anh":
            folderName = "Trứng tiếng Anh";
            break;
          case "Trứng tiếng Việt":
            folderName = "Trứng tiếng Việt";
            break;
          case "Lửng tiếng Anh":
            folderName = "Lửng tiếng Anh";
            break;
          case "Lửng tiếng Việt":
            folderName = "Lửng tiếng Việt";
            break;
          default:
            folderName = channelName;
        }

        // Lấy folder ID tương ứng
        const folderId = channelFolderMap[folderName];

        if (folderId) {
          userChannels.push({
            channelName,
            folderName,
            folderId,
          });
        }
      }
    }

    return userChannels;
  } catch (error) {
    console.error("Error getting user channels:", error);
    return [];
  }
};

// Middleware xác thực người dùng
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    // Token chính là username được lưu trong localStorage
    const username = authHeader.split(" ")[1];

    if (!username) {
      return res.status(401).json({ error: "Unauthorized: Invalid username" });
    }

    // Gán username vào đối tượng req để sử dụng trong các route handler
    req.user = { username };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

// API endpoint lấy danh sách folders người dùng có quyền truy cập
app.get("/api/drive-folders", authenticateUser, async (req, res) => {
  try {
    const { username } = req.user;

    // Lấy danh sách kênh người dùng có quyền truy cập
    const userChannels = await getUserChannels(username);

    // Khởi tạo Google Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Lấy thư mục gốc "Truyền thông" (có thể cấu hình)
    const parentFolderId = "1QwA4xZEvU2sGxk_OVURXUDeZbh3d4uQu"; // ID thư mục "Truyền thông"

    // Lấy tất cả folders con trong thư mục "Truyền thông"
    const response = await drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`,
      fields: "files(id, name)",
    });

    const allFolders = response.data.files;
    console.log("allFolders: ", allFolders);
    // Lọc ra các folder mà người dùng có quyền truy cập
    const accessibleFolders = allFolders.filter((folder) =>
      userChannels.some((channel) => channel.folderName === folder.name)
    );

    res.json({
      folders: accessibleFolders,
      userChannels,
    });
  } catch (error) {
    console.error("Error fetching folders:", error);
    res.status(500).json({ error: "Server error when fetching folders" });
  }
});

// API endpoint lấy danh sách files trong một folder
app.get("/api/drive-files", authenticateUser, async (req, res) => {
  try {
    const { username } = req.user;
    const { folderId } = req.query;

    if (!folderId) {
      return res.status(400).json({ error: "FolderId is required" });
    }

    // Kiểm tra xem người dùng có quyền truy cập folder này không
    const userChannels = await getUserChannels(username);

    try {
      const hasAccess = await checkFolderAccess(folderId, userChannels);

      if (!hasAccess) {
        return res
          .status(403)
          .json({ error: "You do not have permission to access this folder" });
      }
    } catch (error) {
      console.error("Error checking folder permissions:", error);
      return res
        .status(500)
        .json({ error: "Error checking folder permissions" });
    }

    // Khởi tạo Google Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Lấy folder name
    const folderResponse = await drive.files.get({
      fileId: folderId,
      fields: "name",
    });

    const folderName = folderResponse.data.name;

    // Lấy danh sách files và folders trong folder, đảm bảo lấy đủ thông tin
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields:
        "files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, iconLink, thumbnailLink, parents)",
      pageSize: 1000, // Tăng số lượng kết quả trả về
      orderBy: "folder,name", // Sắp xếp folder lên trên
    });

    // Thêm thông tin người tạo cho mỗi file
    const files = await Promise.all(
      response.data.files.map(async (file) => {
        let createdBy = "Unknown";

        try {
          const permissionResponse = await drive.permissions.list({
            fileId: file.id,
            fields: "permissions(emailAddress,role)",
          });

          const owner = permissionResponse.data.permissions.find(
            (p) => p.role === "owner"
          );
          if (owner && owner.emailAddress) {
            createdBy = owner.emailAddress;
          }
        } catch (err) {
          console.error(`Error getting permissions for file ${file.id}:`, err);
        }

        return {
          ...file,
          createdBy,
        };
      })
    );

    // Sắp xếp để folder hiển thị trước file
    const sortedFiles = files.sort((a, b) => {
      // Nếu a là folder và b không phải folder, a được xếp trước
      if (
        a.mimeType === "application/vnd.google-apps.folder" &&
        b.mimeType !== "application/vnd.google-apps.folder"
      ) {
        return -1;
      }
      // Nếu b là folder và a không phải folder, b được xếp trước
      if (
        b.mimeType === "application/vnd.google-apps.folder" &&
        a.mimeType !== "application/vnd.google-apps.folder"
      ) {
        return 1;
      }
      // Nếu cùng là folder hoặc cùng là file, sắp xếp theo tên
      return a.name.localeCompare(b.name);
    });

    res.json({
      files: sortedFiles,
      folderName,
    });
  } catch (error) {
    console.error("Error fetching files:", error);
    res.status(500).json({ error: "Server error when fetching files" });
  }
});

// Hàm kiểm tra quyền truy cập folder (bao gồm cả folder con)
const checkFolderAccess = async (folderId, userChannels) => {
  // Kiểm tra trực tiếp folder
  let hasAccess = userChannels.some((channel) => channel.folderId === folderId);

  if (!hasAccess) {
    // Khởi tạo Google Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Lấy thông tin về folder để kiểm tra folder cha
    let currentFolderId = folderId;
    let parentFound = false;

    // Duyệt lên cây thư mục cho đến khi gặp folder gốc của kênh hoặc đã duyệt hết
    while (currentFolderId && !parentFound) {
      try {
        const folderResponse = await drive.files.get({
          fileId: currentFolderId,
          fields: "parents",
        });

        if (
          !folderResponse.data.parents ||
          folderResponse.data.parents.length === 0
        ) {
          break;
        }

        const parentFolderId = folderResponse.data.parents[0];

        // Kiểm tra xem folder cha có phải là folder gốc của kênh không
        if (
          userChannels.some((channel) => channel.folderId === parentFolderId)
        ) {
          hasAccess = true;
          parentFound = true;
          break;
        }

        // Tiếp tục duyệt lên folder cha
        currentFolderId = parentFolderId;
      } catch (error) {
        console.error("Error checking folder permissions:", error);
        throw error;
      }
    }
  }

  return hasAccess;
};

// Hàm tạo quyền truy cập công khai cho file
const makeFilePublic = async (fileId, isEditable = false) => {
  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Tạo permission để file có thể được truy cập bởi bất kỳ ai có link
    // Với quyền writer nếu isEditable = true, reader nếu isEditable = false
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: isEditable ? "writer" : "reader",
        type: "anyone",
      },
    });

    // Lấy thông tin file sau khi đã chia sẻ để có webViewLink và webContentLink
    const fileResponse = await drive.files.get({
      fileId: fileId,
      fields: "id, name, webViewLink, webContentLink",
    });

    return fileResponse.data;
  } catch (error) {
    console.error("Error making file public:", error);
    throw error;
  }
};

// API endpoint để upload file
app.post(
  "/api/drive-upload",
  upload.single("file"),
  authenticateUser,
  async (req, res) => {
    try {
      const { username } = req.user;
      const { folderId } = req.body;

      if (!folderId) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "FolderId is required" });
      }

      // Kiểm tra xem người dùng có quyền truy cập folder này không
      const userChannels = await getUserChannels(username);

      try {
        const hasAccess = await checkFolderAccess(folderId, userChannels);

        if (!hasAccess) {
          fs.unlinkSync(req.file.path);
          return res.status(403).json({
            error: "You do not have permission to upload to this folder",
          });
        }
      } catch (error) {
        console.error("Error checking folder permissions:", error);
        fs.unlinkSync(req.file.path);
        return res
          .status(500)
          .json({ error: "Error checking folder permissions" });
      }

      const filePath = req.file.path;
      const originalName = req.file.originalname;
      const mimeType = req.file.mimetype;

      // Khởi tạo Google Drive API
      const drive = google.drive({ version: "v3", auth: oauth2Client });

      // Upload file lên Google Drive với streaming để tránh out of memory
      const response = await drive.files.create({
        requestBody: {
          name: originalName,
          parents: [folderId],
        },
        media: {
          mimeType: mimeType,
          body: fs.createReadStream(filePath),
        },
        fields: "id, name",
        // Không chặn/block Node.js event loop trong quá trình upload
        supportsAllDrives: true,
        // Upload sử dụng multipart để hiệu quả hơn
        uploadType: "multipart",
      });

      // Xóa file tạm trên server
      fs.unlinkSync(filePath);

      // Tạo quyền truy cập công khai cho file
      try {
        const publicFileInfo = await makeFilePublic(response.data.id);
        res.json(publicFileInfo);
      } catch (shareError) {
        console.error("Error sharing file:", shareError);
        res.json({
          ...response.data,
          shareError: "File uploaded but could not be shared publicly",
        });
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Server error when uploading file" });
    }
  }
);

// API endpoint để tạo file doc mới
app.post("/api/drive-create-doc", authenticateUser, async (req, res) => {
  try {
    const { username } = req.user;
    const { name, folderId } = req.body;

    if (!name || !folderId) {
      return res.status(400).json({ error: "Name and folderId are required" });
    }

    // Kiểm tra xem người dùng có quyền truy cập folder này không
    const userChannels = await getUserChannels(username);

    try {
      const hasAccess = await checkFolderAccess(folderId, userChannels);

      if (!hasAccess) {
        return res.status(403).json({
          error: "You do not have permission to create files in this folder",
        });
      }
    } catch (error) {
      console.error("Error checking folder permissions:", error);
      return res
        .status(500)
        .json({ error: "Error checking folder permissions" });
    }

    // Khởi tạo Google Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Tạo file mới trong Google Drive
    const response = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: "application/vnd.google-apps.document",
        parents: [folderId],
      },
      fields: "id, name",
    });

    // Tạo quyền truy cập công khai cho file với quyền chỉnh sửa
    try {
      const publicFileInfo = await makeFilePublic(response.data.id, true); // true để cấp quyền writer
      res.json(publicFileInfo);
    } catch (shareError) {
      console.error("Error sharing file:", shareError);
      res.json({
        ...response.data,
        shareError: "File created but could not be shared publicly",
      });
    }
  } catch (error) {
    console.error("Error creating document:", error);
    res.status(500).json({ error: "Server error when creating document" });
  }
});

// API endpoint để xóa file
app.delete("/api/drive-delete-file", authenticateUser, async (req, res) => {
  try {
    const { username } = req.user;
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: "FileId is required" });
    }

    // Khởi tạo Google Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Lấy thông tin file để kiểm tra cha của nó
    const fileResponse = await drive.files.get({
      fileId: fileId,
      fields: "parents",
    });

    if (!fileResponse.data.parents || fileResponse.data.parents.length === 0) {
      return res
        .status(403)
        .json({ error: "Cannot delete file without parent folder" });
    }

    const parentFolderId = fileResponse.data.parents[0];

    // Kiểm tra xem người dùng có quyền truy cập folder cha này không
    const userChannels = await getUserChannels(username);

    try {
      const hasAccess = await checkFolderAccess(parentFolderId, userChannels);

      if (!hasAccess) {
        return res
          .status(403)
          .json({ error: "You do not have permission to delete this file" });
      }
    } catch (error) {
      console.error("Error checking folder permissions:", error);
      return res
        .status(500)
        .json({ error: "Error checking folder permissions" });
    }

    // Xóa file
    await drive.files.delete({
      fileId: fileId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "Server error when deleting file" });
  }
});

// API endpoint để tạo folder mới
app.post("/api/drive-create-folder", authenticateUser, async (req, res) => {
  try {
    const { username } = req.user;
    const { name, parentFolderId } = req.body;

    if (!name || !parentFolderId) {
      return res
        .status(400)
        .json({ error: "Name and parentFolderId are required" });
    }

    // Kiểm tra xem người dùng có quyền truy cập folder này không
    const userChannels = await getUserChannels(username);

    try {
      const hasAccess = await checkFolderAccess(parentFolderId, userChannels);

      if (!hasAccess) {
        return res
          .status(403)
          .json({ error: "You do not have permission to create folders here" });
      }
    } catch (error) {
      console.error("Error checking folder permissions:", error);
      return res
        .status(500)
        .json({ error: "Error checking folder permissions" });
    }

    // Khởi tạo Google Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Tạo folder mới trong Google Drive
    const response = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      },
      fields: "id, name, webViewLink",
    });

    res.json(response.data);
  } catch (error) {
    console.error("Error creating folder:", error);
    res.status(500).json({ error: "Server error when creating folder" });
  }
});

// API endpoint để xóa folder
app.delete("/api/drive-delete-folder", authenticateUser, async (req, res) => {
  try {
    const { username } = req.user;
    const { folderId } = req.body;

    if (!folderId) {
      return res.status(400).json({ error: "FolderId is required" });
    }

    // Khởi tạo Google Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Kiểm tra xem folder có phải là folder gốc của kênh không
    const userChannels = await getUserChannels(username);
    const isRootChannel = userChannels.some(
      (channel) => channel.folderId === folderId
    );

    if (isRootChannel) {
      return res
        .status(403)
        .json({ error: "Cannot delete root channel folder" });
    }

    // Lấy thông tin folder để kiểm tra cha của nó
    const folderResponse = await drive.files.get({
      fileId: folderId,
      fields: "parents",
    });

    if (
      !folderResponse.data.parents ||
      folderResponse.data.parents.length === 0
    ) {
      return res
        .status(403)
        .json({ error: "Cannot delete folder without parent" });
    }

    const parentFolderId = folderResponse.data.parents[0];

    try {
      const hasAccess = await checkFolderAccess(parentFolderId, userChannels);

      if (!hasAccess) {
        return res
          .status(403)
          .json({ error: "You do not have permission to delete this folder" });
      }
    } catch (error) {
      console.error("Error checking folder permissions:", error);
      return res
        .status(500)
        .json({ error: "Error checking folder permissions" });
    }

    // Xóa folder
    await drive.files.delete({
      fileId: folderId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting folder:", error);
    res.status(500).json({ error: "Server error when deleting folder" });
  }
});

//product cPanel db_config
var db_config = isProduct
  ? {
      host: "localhost",
      // user: "zcegdeab_ten_ticker",
      user: "admin",
      password: "LeHuyDucAnh157*",
      // password: "D8XW!d[Lkm$p",

      database: "ebe_media",
    }
  : {
      // host: "us-cdbr-east-03.cleardb.com",
      // user: "bc74e7c7dc5b9e",
      // password: "f04abeb4",
      // database: "heroku_47bd66779dcda20",

      //local
      host: "localhost",
      user: "root",
      password: "tmkITC98",
      database: "ebe_media",
    };

//dev heroku db_config
// var db_config = {
//   host: "us-cdbr-east-03.cleardb.com",
//   user: "bc74e7c7dc5b9e",
//   password: "f04abeb4",
//   database: "heroku_47bd66779dcda20",
// };

var dbTenTicker;

//dev heroku
// var dbTenTicker = mysql.createConnection({
//   host: "us-cdbr-east-03.cleardb.com",
//   user: "bc74e7c7dc5b9e",
//   password: "f04abeb4",
//   database: "heroku_47bd66779dcda20",
// });

//product heroku
// var dbTenTicker = mysql.createConnection({
//   host: "us-cdbr-east-03.cleardb.com",
//   user: "b2b329e77fd088",
//   password: "57100c49",
//   database: "heroku_6d453306171d11b",
// });

//local
// var dbTenTicker = mysql.createConnection({
//   host: "localhost",
//   user: "root",
//   password: "123456",
//   database: "ten_ticker",
// });
function handleDisconnect() {
  dbTenTicker = mysql.createConnection(db_config);
  console.log("restart");
  dbTenTicker.connect(function (err) {
    console.log("Connection OK");
    if (err) {
      console.log("error when connecting to db:", err);
      setTimeout(handleDisconnect, 2000);
    }
  });

  dbTenTicker.on("error", function (err) {
    console.log("db error", err);
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      // Connection to the MySQL server is usually
      handleDisconnect(); // lost due to either server restart, or a
    } else {
      // connnection idle timeout (the wait_timeout
      throw err; // server variable configures this)
    }
  });
}

handleDisconnect();

/*------------------DATA---------------------*/
// Retrieve all data
app.get("/api/tenticker", function (req, res) {
  dbTenTicker.query("SELECT * FROM data", function (error, results, fields) {
    if (error) throw error;
    return res.send({ error: false, data: results, message: "data list." });
  });
});

// Retrieve data with id
app.get("/api/tenticker/:id", function (req, res) {
  let data_id = req.params.id;
  if (!data_id) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide data_id" });
  }
  dbTenTicker.query(
    "SELECT * FROM data where id=?",
    data_id,
    function (error, results, fields) {
      if (error) throw error;
      return res.send({
        error: false,
        data: results[0],
        message: "data list.",
      });
    }
  );
});

// Add a new data
app.post("/api/tenticker/add", function (req, res) {
  let data = req.body.data;
  // console.log("data", data);
  if (!data) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide data" });
  }
  dbTenTicker.query(
    "INSERT INTO data VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [...data],
    function (error, results, fields) {
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "New data has been created successfully.",
      });
    }
  );
});

//  Update data with id
app.put("/api/tenticker", function (req, res) {
  let data_id = req.body.data_id;
  let data = req.body.data;
  // console.log("data_id", data_id);
  // console.log("data", data[22]);
  if (!data_id || !data) {
    return res
      .status(400)
      .send({ error: data, message: "Please provide data and data_id" });
  }
  dbTenTicker.query(
    "UPDATE data SET id = ?, content_code = ?, writer_code = ?, full_title =?, content_raw = ?, writer_name=?,  content_status=?,  content_final = ?, content_note = ?, content_date = ?, composer_code = ?, composer_name = ?, audio_date = ?, link_audio = ?, audio_status = ? ,audio_note = ?, writer_nick =?, composer_nick = ?, editor_name=?,  video_date=?,  footage = ?, editor_code = ?, link_video = ?, video_status = ?, video_note = ?, link_youtube = ?, public_date = ?, is_first_public = ?, is_first_content_final =?, is_first_audio = ?, is_first_video = ?, add_composer_date = ?, add_ve_date = ?, confirm_content_date = ?, confirm_video_date = ?, confirm_audio_date = ?, salary_index = ?, is_new = ?, content_length = ?  WHERE id = ?",
    [...data, data_id],
    function (error, results, fields) {
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "data has been updated successfully.",
      });
    }
  );
});

//  Delete data
app.delete("/api/tenticker", function (req, res) {
  // console.log("req.body", req.body);
  let data_id = req.body.data_id;
  // console.log("data_id", data_id);
  if (!data_id) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide data_id" });
  }
  dbTenTicker.query(
    "DELETE FROM data WHERE id in (?)",
    [data_id],
    function (error, results, fields) {
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "Data has been delete successfully.",
      });
    }
  );
});

//Delete all data
app.delete("/api/tenticker/all", function (req, res) {
  dbTenTicker.query("TRUNCATE TABLE data", function (error, results, field) {
    if (error) throw error;
    return res.send({
      error: false,
      data: results,
      message: "Delete all data successfully",
    });
  });
});

/*------------------ACTIVITY---------------------*/

// Retrieve all activity
app.get("/api/activity", function (req, res) {
  dbTenTicker.query(
    "SELECT * FROM activity",
    function (error, results, fields) {
      if (error) throw error;
      return res.send({ error: false, data: results, message: "data list." });
    }
  );
});

// Retrieve acitivity with id
app.get("/api/activity/:id", function (req, res) {
  let activity_id = req.params.id;
  if (!activity_id) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide activity_id" });
  }
  dbTenTicker.query(
    "SELECT * FROM activity where id=?",
    activity_id,
    function (error, results, fields) {
      if (error) throw error;
      return res.send({
        error: false,
        data: results[0],
        message: "data list.",
      });
    }
  );
});

// Add a new activity
app.post("/api/activity/add", function (req, res) {
  let activity = req.body.data;
  let content_code = req.body.content_code; // Thêm content_code từ request
  console.log("activity", activity);
  console.log("content_code", content_code);
  if (!activity) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide activity" });
  }

  dbTenTicker.query(
    "INSERT INTO activity VALUES (?, ?, ?, ?)",
    [...activity],
    async function (error, results, fields) {
      if (error) throw error;

      try {
        // Gửi thông báo Telegram khi thêm mới activity
        const newData = {
          id: activity[0],
          activity_date: activity[1],
          activity: activity[2],
          user_name: activity[3],
        };

        // Sử dụng content_code để xác định kênh
        let channelName = content_code || "Vẹt tiếng Anh"; // Sử dụng content_code nếu có

        // Lấy username Telegram của người tạo để tag
        const telegramUsername = await getTelegramUsername(newData.user_name);
        let mentionedUsers = [];
        if (telegramUsername) {
          mentionedUsers.push(telegramUsername);
        }

        // Parse activity để tìm người được thay đổi thành
        const activityMentions = await parseActivityForMentions(
          newData.activity
        );
        mentionedUsers = [...mentionedUsers, ...activityMentions];

        // Tạo message thông báo
        let message = `🎊 <b>THÔNG BÁO</b>\n`;
        message += `Kênh: <b>${channelName}</b>\n`;
        message += `Người tạo: <b>${newData.user_name}</b>\n`;
        message += `Ngày: <b>${moment(newData.activity_date).format(
          "DD/MM/YYYY HH:mm"
        )}</b>\n`;
        message += `Nội dung: <b>${newData.activity}</b>`;

        // Gửi thông báo Telegram với tag
        await sendTelegramNotification(channelName, message, mentionedUsers);
      } catch (telegramError) {
        console.error("Lỗi gửi thông báo Telegram:", telegramError);
        // Không ảnh hưởng đến việc thêm activity
      }

      return res.send({
        error: false,
        data: results,
        message: "New activity has been created successfully.",
      });
    }
  );
});

// API để test parse activity mentions
app.post("/api/telegram/test-parse", async function (req, res) {
  const { activityText } = req.body;

  if (!activityText) {
    return res.status(400).send({
      error: true,
      message: "Please provide activityText",
    });
  }

  try {
    const mentionedUsers = await parseActivityForMentions(activityText);
    res.send({
      error: false,
      message: `Parse thành công`,
      mentionedUsers: mentionedUsers,
      activityText: activityText,
    });
  } catch (error) {
    res.status(500).send({
      error: true,
      message: "Lỗi parse activity",
      error: error.message,
    });
  }
});

//  Update activity with id
app.put("/api/activity", function (req, res) {
  let activity_id = req.body.activity_id;
  let activity = req.body.data;
  let content_code = req.body.content_code; // Thêm content_code từ request
  console.log("activity_id", activity_id);
  console.log("activity", activity);
  console.log("content_code", content_code);
  if (!activity_id || !activity) {
    return res.status(400).send({
      error: data,
      message: "Please provide activity and activity_id",
    });
  }

  // Lấy thông tin activity cũ để so sánh
  dbTenTicker.query(
    "SELECT * FROM activity WHERE id = ?",
    [activity_id],
    async function (error, oldActivity, fields) {
      if (error) throw error;

      // Update activity
      dbTenTicker.query(
        "UPDATE activity SET id = ?, activity_date = ?,  activity = ?, user_name = ?  WHERE id = ?",
        [...activity, activity_id],
        async function (error, results, fields) {
          if (error) throw error;

          try {
            // Gửi thông báo Telegram nếu có thay đổi
            if (oldActivity && oldActivity.length > 0) {
              const oldData = oldActivity[0];
              const newData = {
                id: activity[0],
                activity_date: activity[1],
                activity: activity[2],
                user_name: activity[3],
              };

              // Kiểm tra xem có thay đổi gì không
              if (
                oldData.user_name !== newData.user_name ||
                oldData.activity !== newData.activity
              ) {
                // Sử dụng content_code để xác định kênh
                let channelName = content_code || "Vẹt tiếng Anh"; // Sử dụng content_code nếu có

                // Tạo message thông báo
                let message = `📝 <b>Cập nhật Activity</b>\n`;
                message += `ID: <b>${newData.id}</b>\n`;
                message += `Kênh: <b>${channelName}</b>\n`;
                message += `Người cập nhật: <b>${newData.user_name}</b>\n`;
                message += `Ngày: <b>${moment(newData.activity_date).format(
                  "DD/MM/YYYY HH:mm"
                )}</b>\n`;

                // Lấy username Telegram của editor mới để tag
                let mentionedUsers = [];
                if (oldData.user_name !== newData.user_name) {
                  message += `\n🔄 <b>Thay đổi Editor:</b>\n`;
                  message += `Từ: <b>${oldData.user_name}</b>\n`;
                  message += `Thành: <b>${newData.user_name}</b>`;

                  // Tag editor mới
                  const telegramUsername = await getTelegramUsername(
                    newData.user_name
                  );
                  if (telegramUsername) {
                    mentionedUsers.push(telegramUsername);
                  }
                }

                if (oldData.activity !== newData.activity) {
                  message += `\n📄 <b>Thay đổi nội dung:</b>\n`;
                  message += `Từ: <b>${oldData.activity}</b>\n`;
                  message += `Thành: <b>${newData.activity}</b>`;

                  // Parse activity mới để tìm người được thay đổi thành
                  const activityMentions = await parseActivityForMentions(
                    newData.activity
                  );
                  mentionedUsers = [...mentionedUsers, ...activityMentions];
                }

                // Gửi thông báo Telegram với tag
                await sendTelegramNotification(
                  channelName,
                  message,
                  mentionedUsers
                );
              }
            }
          } catch (telegramError) {
            console.error("Lỗi gửi thông báo Telegram:", telegramError);
            // Không ảnh hưởng đến việc update activity
          }

          return res.send({
            error: false,
            data: results,
            message: "activity has been updated successfully.",
          });
        }
      );
    }
  );
});

//  Delete activity
app.delete("/api/activity", function (req, res) {
  console.log("req.body", req.body);
  let activity_time = req.body.activity_time;
  console.log("activity_time", activity_time);
  if (!activity_time) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide activity_time" });
  }
  dbTenTicker.query(
    "DELETE FROM activity WHERE activity_date > ? AND activity_date < ?",
    // "DELETE FROM activity WHERE id in (?)",
    [...activity_time],
    function (error, results, fields) {
      console.log("delete success");
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "Data has been delete successfully.",
      });
    }
  );
});

app.delete("/api/activity/check", function (req, res) {
  let activity_id = req.body.activity_id;
  if (!activity_id) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide activity_id" });
  }
  dbTenTicker.query(
    "DELETE FROM activity WHERE id in (?)",
    [activity_id],
    function (error, results, fields) {
      console.log("delete success");
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "Data has been delete successfully.",
      });
    }
  );
});

/*------------------SALARY---------------------*/
// Retrieve all salary
app.post("/api/salary", function (req, res) {
  let month = req.body.month;
  let year = req.body.year;
  console.log("month", month);
  console.log("year", year);
  dbTenTicker.query(
    "SELECT * FROM salary WHERE thang = ? && nam = ?",
    [month, year],
    function (error, results, fields) {
      if (error) throw error;
      return res.send({ error: false, data: results, message: "salary list." });
    }
  );
});

// // Retrieve salary with id
// app.get("/salary/:id", function (req, res) {
//   let salary = req.params.id;
//   if (!salary_id) {
//     return res
//       .status(400)
//       .send({ error: true, message: "Please provide salary_id" });
//   }
//   dbTenTicker.query(
//     "SELECT * FROM salary where id=?",
//     salary_id,
//     function (error, results, fields) {
//       if (error) throw error;
//       return res.send({
//         error: false,
//         data: results[0],
//         message: "salary list.",
//       });
//     }
//   );
// });

//count world in content
app.post("/api/countWord", async function (req, res) {
  let sheetUrl = req.body.sheetUrl;
  console.log("sheetUrl: ", sheetUrl);

  // Kiểm tra nếu sheetUrl rỗng hoặc null
  if (!sheetUrl || sheetUrl.trim() === "") {
    console.log("sheetUrl is empty, returning 0 word count");
    return res.send({
      error: false,
      data: 0,
      message: "Empty content, word count is 0",
    });
  }

  // Trích xuất Google Doc ID từ URL
  const documentId = extractGoogleDocID(sheetUrl);

  // Kiểm tra nếu không phải Google Doc URL hoặc không trích xuất được ID
  if (!documentId) {
    console.log(
      "Invalid Google Doc URL or cannot extract document ID, returning 0 word count"
    );
    return res.send({
      error: false,
      data: 0,
      message: "Invalid Google Doc URL, word count is 0",
    });
  }

  try {
    const data = await readGoogleDocs(documentId);

    // Kiểm tra nếu không đọc được document hoặc data là undefined
    if (!data || !data.body || !data.body.content) {
      console.log(
        "Cannot read Google Doc or document is empty, returning 0 word count"
      );
      return res.send({
        error: false,
        data: 0,
        message: "Cannot read Google Doc, word count is 0",
      });
    }

    //   console.log("data: ", data);
    // Extract and log the text content from the document
    //   console.log(
    //     data.body.content.map((d) => d.paragraph?.elements[0]["textRun"])
    //   );
    // let content = data.body.content
    //   .map((d) => d.paragraph?.elements[0]["textRun"])
    //   ?.map((item) => item?.content)
    //   ?.join(" ");
    let content = extractAllText(data.body.content);
    console.log("content: ", content);
    const wordCount = countWords(content);
    console.log("wordCount: ", wordCount);
    return res.send({ error: false, data: wordCount, message: "word count" });
  } catch (error) {
    console.error("Error reading Google Doc:", error);
    return res.send({
      error: false,
      data: 0,
      message: "Error reading Google Doc, word count is 0",
    });
  }
});

// Add a new salary
app.post("/api/salary/add", function (req, res) {
  let salary = req.body.salary;
  console.log("salary", salary);
  if (!salary) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide salary" });
  }
  dbTenTicker.query(
    "INSERT INTO salary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [...salary],
    function (error, results, fields) {
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "New salary has been created successfully.",
      });
    }
  );
});

//  Update salary with id
// app.put("/salary", function (req, res) {
//   let salary_id = req.body.salary_id;
//   let salary = req.body.data;
//   console.log("salary_id", salary_id);
//   console.log("salary", salary);
//   if (!salary_id || !salary) {
//     return res.status(400).send({
//       error: data,
//       message: "Please provide salary and salary_id",
//     });
//   }
//   dbTenTicker.query(
//     "UPDATE salary_temp SET id = ?, thuong = ?, phat = ?, note_khac = ?  WHERE id = ?",
//     [...salary, salary_id],
//     function (error, results, fields) {
//       if (error) throw error;
//       return res.send({
//         error: false,
//         data: results,
//         message: "salary has been updated successfully.",
//       });
//     }
//   );
// });

//Delete all salary in month
app.delete("/api/salary/check", function (req, res) {
  console.log("req.body", req.body);
  let thang = req.body.thang;
  let nam = req.body.nam;
  console.log("thang", thang);
  console.log("nam", nam);
  if (!thang) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide thang" });
  }
  dbTenTicker.query(
    "DELETE FROM salary WHERE thang = ? && nam = ?",
    [thang, nam],
    function (error, results, fields) {
      console.log("delete salary success");
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "salary has been delete successfully.",
      });
    }
  );
});

/*------------------SALARY_TEMP---------------------*/

// Retrieve all salary_temp
app.post("/api/salary_temp", function (req, res) {
  let month = req.body.month;
  let year = req.body.year;
  console.log("month", month);
  console.log("year", year);
  dbTenTicker.query(
    "SELECT * FROM salary_temp WHERE thang = ? && nam = ?",
    [month, year],
    function (error, results, fields) {
      if (error) throw error;
      return res.send({ error: false, data: results, message: "salary list." });
    }
  );
});

// Add a new salary
app.post("/api/salary_temp/add", function (req, res) {
  let salary = req.body.salary;
  console.log("salary", salary);
  if (!salary) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide salary" });
  }
  dbTenTicker.query(
    "INSERT INTO salary_temp VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [...salary],
    function (error, results, fields) {
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "New salary has been created successfully.",
      });
    }
  );
});

//Delete all salary_temp in month
app.delete("/api/salary_temp/check", function (req, res) {
  console.log("req.body", req.body);
  let thang = req.body.thang;
  let nam = req.body.nam;
  console.log("thang", thang);
  console.log("nam", nam);
  if (!thang) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide thang" });
  }
  dbTenTicker.query(
    "DELETE FROM salary_temp WHERE thang = ? && nam = ?",
    [thang, nam],
    function (error, results, fields) {
      console.log("delete salary success");
      if (error) throw error;
      return res.send({
        error: false,
        data: results,
        message: "salary has been delete successfully.",
      });
    }
  );
});

/*------------------REPORT---------------------*/
// Retrieve all data report cw
app.get("/api/reportCW", function (req, res) {
  // console.log("req", req.query.monthYear);
  let month_year = req.query.monthYear;
  if (!month_year) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide monthYear" });
  }
  dbTenTicker.query(
    "SELECT * FROM report_cw where month_year = ? ORDER BY id ASC",
    month_year,
    function (error, results, fields) {
      if (error) throw error;
      return res.send({ error: false, data: results, message: "data list." });
    }
  );
});

// Retrieve all data report ac
app.get("/api/reportAC", function (req, res) {
  // console.log("req", req.query.monthYear);
  let month_year = req.query.monthYear;
  if (!month_year) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide monthYear" });
  }
  dbTenTicker.query(
    "SELECT * FROM report_ac where month_year = ? ORDER BY id ASC",
    month_year,
    function (error, results, fields) {
      if (error) throw error;
      return res.send({ error: false, data: results, message: "data list." });
    }
  );
});

// Retrieve all data report ve
app.get("/api/reportVE", function (req, res) {
  // console.log("req", req.query.monthYear);
  let month_year = req.query.monthYear;
  if (!month_year) {
    return res
      .status(400)
      .send({ error: true, message: "Please provide monthYear" });
  }
  dbTenTicker.query(
    "SELECT * FROM report_ve where month_year = ? ORDER BY id ASC",
    month_year,
    function (error, results, fields) {
      if (error) throw error;
      return res.send({ error: false, data: results, message: "data list." });
    }
  );
});

/*------------------YOUTUBE API---------------------*/

//Get link authen
app.get("/api/authen", function (req, res) {
  return res.send({ error: false, data: authUrl, message: "data list." });
});

app.get("/api/getToken", function (req, res) {
  let code = req.query.code;
  console.log("code", code);

  oAuth2Client.getToken(code, async (err, token) => {
    console.log("token", token);
    // oAuth2Client.setCredentials(token);
    // const result = await callApi(oAuth2Client);
    // console.log("resulttttttt", result);
    return res.send({ error: false, data: token, message: "data list." });
  });
});

app.post("/api/yapi", async function (req, res) {
  let token = req.body.token;
  let videoIds = req.body.videoIds;
  console.log("token", token);

  oAuth2Client.setCredentials(token);
  const result = await callApi(oAuth2Client, videoIds);
  console.log("resulttttttt", result);

  return res.send({ error: false, data: result, message: "data list." });
});

app.post("/api/getChannelId", async function (req, res) {
  let token = req.body.token;
  console.log("token getChannelId", token);

  oAuth2Client.setCredentials(token);
  const result = await getChannelId(oAuth2Client);
  console.log("result getChannelId", result);
  return res.send({ error: false, data: result, message: "getChannelId" });
});

/*------------------SCHEDULE REPORT ---------------------*/

//Schedule CW Report

var taskCW = cron.schedule(
  `*/${minutes_update_report} * * * *`,
  // "*/720 * * * *",
  () => {
    dbTenTicker.query(
      "DELETE FROM report_cw WHERE month_year = ?",
      [monthNowString],
      function (error, results, fields) {
        axios
          .get(
            `https://sheets.googleapis.com/v4/spreadsheets/1Z_ucuIK9wVHmMiCTThKBLH_3uN2REFW6k31Ov8hgnk0/values:batchGet?ranges=Sheet2&majorDimension=ROWS&key=${
              process.env.GOOGLE_SHEETS_API_KEY ||
              "AIzaSyByXzekuWCb4pI-ZTD7yEAGVYV0224Mc6Q"
            }`
          )
          .then((res) => {
            const data = res.data.valueRanges[0].values;
            const filterData = data.filter((item, index) => {
              return item[fixUserColumn.cw] === "1" && index !== 0;
            });
            const mapData = filterData.map((item, index) => {
              return {
                id: item[fixUserColumn.id],
                name: item[fixUserColumn.name],
                status: item[fixUserColumn.status],
                type: item[fixUserColumn.type],
                cms: item[fixUserColumn.cms],
              };
            });
            dbTenTicker.query(
              "SELECT * FROM data",
              function (error, results, fields) {
                if (error) throw error;
                const mapDataSource = map(mapData, async (item, index) => {
                  let countContent2k = 0,
                    countContent1k = 0,
                    viewCount = 0;

                  for (let i = 0; i < results.length; i++) {
                    if (
                      includes(results[i].writer_name, item.cms) &&
                      +moment(results[i].public_date).format("MM") ===
                        monthNow &&
                      +moment(results[i].public_date).format("YYYY") === yearNow
                    ) {
                      // console.log("linkYoutube", results[i].link_youtube);
                      const video_id = YouTubeGetID(results[i].link_youtube);

                      const payload = {
                        baseURL: "https://www.googleapis.com/youtube/v3/videos",
                        params: {
                          part: "statistics",
                          key: KEY,
                          id: video_id,
                        },
                      };

                      const youtube = axios.create(payload);
                      if (results[i].salary_index === 10) {
                        countContent2k++;
                      } else if (results[i].salary_index === 5) {
                        countContent1k++;
                      }
                      const response = await youtube.get("/");
                      viewCount += !!get(
                        response,
                        "data.items[0].statistics.viewCount"
                      )
                        ? +get(response, "data.items[0].statistics.viewCount")
                        : 0;
                    }
                  }
                  return {
                    san_luong_content_2k: countContent2k,
                    san_luong_content_1k: countContent1k,
                    tong_san_luong_content: countContent2k + countContent1k,
                    views_count: !!viewCount ? viewCount : 0,
                    views_per_content:
                      countContent2k + countContent1k === 0
                        ? 0
                        : !!viewCount
                        ? viewCount / (countContent2k + countContent1k)
                        : 0,
                    ...item,
                  };
                });
                for (let i = 0; i < mapDataSource.length; i++) {
                  let id,
                    name,
                    status,
                    type,
                    san_luong_content_2k,
                    san_luong_content_1k,
                    tong_san_luong_content,
                    views_count,
                    views_per_content;
                  mapDataSource[i]
                    .then((result) => {
                      id = result.id;
                      name = result.name;
                      status = result.status;
                      type = result.type;
                      san_luong_content_2k = result.san_luong_content_2k;
                      san_luong_content_1k = result.san_luong_content_1k;
                      tong_san_luong_content = result.tong_san_luong_content;
                      views_count = result.views_count;
                      views_per_content = result.views_per_content;

                      const dataReportCW = [
                        id,
                        name,
                        status,
                        type,
                        san_luong_content_2k,
                        san_luong_content_1k,
                        tong_san_luong_content,
                        views_count,
                        views_per_content,
                        monthNowString,
                      ];
                      if (error) throw error;
                      dbTenTicker.query(
                        "INSERT INTO report_cw VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [...dataReportCW],
                        function (error, results, fields) {
                          if (error) throw error;
                          console.log("insert success report cw", results);
                        }
                      );
                    })
                    .catch((e) => {
                      console.log("error", e);
                    });
                  console.log("id", mapDataSource[i].id);
                }
              }
            );
          });
      }
    );
  },
  {
    scheduled: false,
  }
);

//Schedule VE Report

var taskVE = cron.schedule(
  `*/${minutes_update_report} * * * *`,
  // "*/720 * * * *",
  () => {
    dbTenTicker.query(
      "DELETE FROM report_ve WHERE month_year = ?",
      [monthNowString],
      function (error, results, fields) {
        axios
          .get(
            `https://sheets.googleapis.com/v4/spreadsheets/1Z_ucuIK9wVHmMiCTThKBLH_3uN2REFW6k31Ov8hgnk0/values:batchGet?ranges=Sheet2&majorDimension=ROWS&key=${
              process.env.GOOGLE_SHEETS_API_KEY ||
              "AIzaSyByXzekuWCb4pI-ZTD7yEAGVYV0224Mc6Q"
            }`
          )
          .then((res) => {
            const data = res.data.valueRanges[0].values;
            const filterData = data.filter((item, index) => {
              return item[fixUserColumn.ve] === "1" && index !== 0;
            });
            const mapData = filterData.map((item, index) => {
              return {
                id: item[fixUserColumn.id],
                name: item[fixUserColumn.name],
                status: item[fixUserColumn.status],
                type: item[fixUserColumn.type],
                cms: item[fixUserColumn.cms],
              };
            });
            dbTenTicker.query(
              "SELECT * FROM data",
              function (error, results, fields) {
                if (error) throw error;
                const mapDataSource = map(mapData, async (item, index) => {
                  let countVideo2k = 0,
                    countVideo1k = 0,
                    viewCount = 0;

                  for (let i = 0; i < results.length; i++) {
                    if (
                      includes(results[i].editor_name, item.cms) &&
                      +moment(results[i].public_date).format("MM") ===
                        monthNow &&
                      +moment(results[i].public_date).format("YYYY") === yearNow
                    ) {
                      // console.log("linkYoutube", results[i].link_youtube);
                      const video_id = YouTubeGetID(results[i].link_youtube);

                      const payload = {
                        baseURL: "https://www.googleapis.com/youtube/v3/videos",
                        params: {
                          part: "statistics",
                          key: KEY,
                          id: video_id,
                        },
                      };

                      const youtube = axios.create(payload);
                      if (results[i].salary_index === 10) {
                        countVideo2k++;
                      } else if (results[i].salary_index === 5) {
                        countVideo1k++;
                      }
                      const response = await youtube.get("/");
                      viewCount += !!get(
                        response,
                        "data.items[0].statistics.viewCount"
                      )
                        ? +get(response, "data.items[0].statistics.viewCount")
                        : 0;
                    }
                  }
                  return {
                    san_luong_video_2k: countVideo2k,
                    san_luong_video_1k: countVideo1k,
                    tong_san_luong_video: countVideo2k + countVideo1k,
                    views_count: !!viewCount ? viewCount : 0,
                    views_per_video:
                      countVideo2k + countVideo1k === 0
                        ? 0
                        : !!viewCount
                        ? viewCount / (countVideo2k + countVideo1k)
                        : 0,
                    ...item,
                  };
                });
                for (let i = 0; i < mapDataSource.length; i++) {
                  let id,
                    name,
                    status,
                    type,
                    san_luong_video_2k,
                    san_luong_video_1k,
                    tong_san_luong_video,
                    views_count,
                    views_per_video;
                  mapDataSource[i]
                    .then((result) => {
                      id = result.id;
                      name = result.name;
                      status = result.status;
                      type = result.type;
                      san_luong_video_2k = result.san_luong_video_2k;
                      san_luong_video_1k = result.san_luong_video_1k;
                      tong_san_luong_video = result.tong_san_luong_video;
                      views_count = result.views_count;
                      views_per_video = result.views_per_video;

                      const dataReportVE = [
                        id,
                        name,
                        status,
                        type,
                        san_luong_video_2k,
                        san_luong_video_1k,
                        tong_san_luong_video,
                        views_count,
                        views_per_video,
                        monthNowString,
                      ];
                      if (error) throw error;
                      dbTenTicker.query(
                        "INSERT INTO report_ve VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [...dataReportVE],
                        function (error, results, fields) {
                          if (error) throw error;
                          console.log("insert success report ve", results);
                        }
                      );
                    })
                    .catch((e) => {
                      console.log("error", e);
                    });
                  console.log("id", mapDataSource[i].id);
                }
              }
            );
          });
      }
    );
  },
  {
    scheduled: false,
  }
);

//Schedule AC Report

var taskAC = cron.schedule(
  `*/${minutes_update_report} * * * *`,
  // "*/720 * * * *",
  () => {
    dbTenTicker.query(
      "DELETE FROM report_ac WHERE month_year = ?",
      [monthNowString],
      function (error, results, fields) {
        axios
          .get(
            `https://sheets.googleapis.com/v4/spreadsheets/1Z_ucuIK9wVHmMiCTThKBLH_3uN2REFW6k31Ov8hgnk0/values:batchGet?ranges=Sheet2&majorDimension=ROWS&key=${
              process.env.GOOGLE_SHEETS_API_KEY ||
              "AIzaSyByXzekuWCb4pI-ZTD7yEAGVYV0224Mc6Q"
            }`
          )
          .then((res) => {
            const data = res.data.valueRanges[0].values;
            const filterData = data.filter((item, index) => {
              return item[fixUserColumn.ac] === "1" && index !== 0;
            });
            const mapData = filterData.map((item, index) => {
              return {
                id: item[fixUserColumn.id],
                name: item[fixUserColumn.name],
                status: item[fixUserColumn.status],
                type: item[fixUserColumn.type],
                cms: item[fixUserColumn.cms],
              };
            });
            dbTenTicker.query(
              "SELECT * FROM data",
              function (error, results, fields) {
                if (error) throw error;
                const mapDataSource = map(mapData, async (item, index) => {
                  let countAudio = 0,
                    viewCount = 0;

                  for (let i = 0; i < results.length; i++) {
                    if (
                      includes(results[i].composer_name, item.cms) &&
                      +moment(results[i].public_date).format("MM") ===
                        monthNow &&
                      +moment(results[i].public_date).format("YYYY") === yearNow
                    ) {
                      // console.log("linkYoutube", results[i].link_youtube);
                      const video_id = YouTubeGetID(results[i].link_youtube);

                      const payload = {
                        baseURL: "https://www.googleapis.com/youtube/v3/videos",
                        params: {
                          part: "statistics",
                          key: KEY,
                          id: video_id,
                        },
                      };

                      const youtube = axios.create(payload);
                      countAudio++;
                      const response = await youtube.get("/");
                      viewCount += !!get(
                        response,
                        "data.items[0].statistics.viewCount"
                      )
                        ? +get(response, "data.items[0].statistics.viewCount")
                        : 0;
                    }
                  }
                  return {
                    count_audio: countAudio,
                    views_count: !!viewCount ? viewCount : 0,
                    views_per_audio:
                      countAudio === 0
                        ? 0
                        : !!viewCount
                        ? viewCount / countAudio
                        : 0,
                    ...item,
                  };
                });
                for (let i = 0; i < mapDataSource.length; i++) {
                  let id,
                    name,
                    status,
                    type,
                    count_audio,
                    views_count,
                    views_per_audio;
                  mapDataSource[i]
                    .then((result) => {
                      id = result.id;
                      name = result.name;
                      status = result.status;
                      type = result.type;
                      count_audio = result.count_audio;
                      views_count = result.views_count;
                      views_per_audio = result.views_per_audio;

                      const dataReportAC = [
                        id,
                        name,
                        status,
                        type,
                        count_audio,
                        views_count,
                        views_per_audio,
                        monthNowString,
                      ];
                      if (error) throw error;
                      dbTenTicker.query(
                        "INSERT INTO report_ac VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        [...dataReportAC],
                        function (error, results, fields) {
                          if (error) throw error;
                          console.log("insert success report ac", results);
                        }
                      );
                    })
                    .catch((e) => {
                      console.log("error", e);
                    });
                  console.log("id", mapDataSource[i].id);
                }
              }
            );
          });
      }
    );
  },
  {
    scheduled: false,
  }
);

//Schedule AC Report

// var taskMapView = cron.schedule(
//   "*/1 * * * * *",
//   // "*/720 * * * *",
//   () => {
//     dbTenTicker.query(
//       "TRUNCATE TABLE dataMapView",
//       function (error, results, field) {
//         if (error) throw error;
//         dbTenTicker.query(
//           "SELECT * FROM data",
//           function (error, results, fields) {
//             if (error) throw error;
//             // console.log("results", results);

//             const mapDataSource = map(results, async (item, index) => {
//               let viewCount = 0;
//               // console.log("item", item.link_youtube);
//               if (!isEmpty(item.link_youtube)) {
//                 const video_id = YouTubeGetID(item.link_youtube);
//                 // console.log("video_id", video_id);
//                 if (video_id.length !== 11) {
//                   viewCount = 0;
//                 } else {
//                   const payload = {
//                     baseURL: "https://www.googleapis.com/youtube/v3/videos",
//                     params: {
//                       part: "statistics",
//                       key: KEY,
//                       id: video_id,
//                     },
//                   };

//                   const youtube = axios.create(payload);
//                   const response = await youtube.get("/");
//                   viewCount = !!get(
//                     response,
//                     "data.items[0].statistics.viewCount"
//                   )
//                     ? +get(response, "data.items[0].statistics.viewCount")
//                     : 0;
//                 }
//               } else {
//                 viewCount = 0;
//               }
//               return {
//                 ...item,
//                 viewCount,
//               };
//             });
//             for (let i = 0; i < mapDataSource.length; i++) {
//               mapDataSource[i]
//                 .then((result) => {
//                   // console.log("result", result);
//                   const dataMapView = [
//                     result.id,
//                     result.content_code,
//                     result.writer_code,
//                     result.full_title,
//                     result.content_raw,
//                     result.writer_name,
//                     result.content_status,
//                     result.content_final,
//                     result.content_note,
//                     result.content_date,
//                     result.composer_code,
//                     result.composer_name,
//                     result.audio_date,
//                     result.link_audio,
//                     result.audio_status,
//                     result.audio_note,
//                     result.writer_nick,
//                     result.composer_nick,
//                     result.editor_name,
//                     result.video_date,
//                     result.editor_code,
//                     result.link_video,
//                     result.content_code,
//                     result.video_status,
//                     result.video_note,
//                     result.link_youtube,
//                     result.public_date,
//                     result.is_first_public,
//                     result.is_first_content_final,
//                     result.is_first_audio,
//                     result.is_first_video,
//                     result.add_composer_date,
//                     result.add_ve_date,
//                     result.confirm_content_date,
//                     result.confirm_audio_date,
//                     result.salary_index,
//                     result.is_new,
//                     result.viewCount,
//                   ];
//                   dbTenTicker.query(
//                     "INSERT INTO dataMapView VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
//                     [...dataMapView],
//                     function (error, results, fields) {
//                       if (error) throw error;
//                       console.log("Insert success");
//                     }
//                   );
//                 })
//                 .catch((e) => {
//                   console.log("error", e);
//                 });
//             }
//           }
//         );
//       }
//     );
//   },
//   {
//     scheduled: false,
//   }
// );

// taskMapView.start();

// if (!isProduct) {
//   console.log("run report");
//   taskCW.start();
//   taskVE.start();
//   taskAC.start();
// }
taskCW.start();
taskVE.start();
taskAC.start();

module.exports = app;
