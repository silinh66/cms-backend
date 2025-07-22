// Import the googleapis library
const { google } = require("googleapis");

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
    console.error("error", error); // Log any errors that occur
  }
}

function countWords(text) {
  // Xóa các ký tự không cần thiết và tách chuỗi thành mảng dựa vào khoảng trắng
  const words = text.trim().replace(/\s{2,}/g, ' ').split(/\s+/);

  // Trả về số lượng từ
  return words.length;
}

// Enhanced function to extract all text elements from a paragraph
function extractAllText(content) {
  return content.flatMap(d => d.paragraph?.elements || [])
                .map(element => element.textRun?.content || '')
                .join('');
}

(async () => {
  const documentId = extractGoogleDocID("https://docs.google.com/document/d/1YGTqrJzMkvvHjU4WTa8OWsZbebUwg3BRjxY87u8ry9o/edit");
  const data = await readGoogleDocs(documentId);
  let content = extractAllText(data.body.content); // Use the enhanced function to extract text
  console.log("content: ", content);
  const wordCount = countWords(content);
  console.log("wordCount: ", wordCount);
})();
