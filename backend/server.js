const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { exec } = require("child_process");

const app = express();
const port = 5000;

// Enable CORS to allow requests from the React frontend
app.use(
  cors({
    origin: "http://localhost:3000", // Update this if the frontend is running on a different port
    methods: ["POST", "GET"],
  })
);

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Uploads folder
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // Add timestamp to filename
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDFs are allowed"), false);
    }
    cb(null, true);
  },
});

// Create 'uploads' folder if it doesn't exist
const dir = "./uploads";
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

// Compress the PDF using Ghostscript
const compressPDF = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    // Input and output paths are wrapped in quotes to handle spaces
    const gsCommand = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

    exec(gsCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error compressing PDF: ${stderr}`);
        return reject(error);
      }
      resolve();
    });
  });
};

// Upload route
app.post("/upload", upload.single("pdf"), async (req, res) => {
  const inputPath = req.file ? req.file.path : null;
  if (!inputPath) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const outputPath = path.join("uploads", "compressed-" + req.file.filename);

  try {
    // Compress the PDF
    await compressPDF(inputPath, outputPath);

    // Get file sizes
    const originalFileSize = fs.statSync(inputPath).size;
    const compressedFileSize = fs.statSync(outputPath).size;

    let finalFilePath;
    let finalFileSize;

    if (compressedFileSize >= originalFileSize) {
      // If compressed file is larger or equal to original, keep the original
      finalFilePath = inputPath;
      finalFileSize = originalFileSize;

      // Delete the compressed file since it's larger
      fs.unlinkSync(outputPath);
    } else {
      // If compressed file is smaller, keep the compressed file and delete the original
      finalFilePath = outputPath;
      finalFileSize = compressedFileSize;

      // Delete the original file as we are keeping the compressed one
      fs.unlinkSync(inputPath);
    }

    // Respond with the final file's size and path
    res.json({
      message: "File uploaded and processed successfully",
      originalSize: (originalFileSize / 1024).toFixed(2) + " KB", // Original file size in KB
      compressedSize: (compressedFileSize / 1024).toFixed(2) + " KB", // Compressed file size in KB
      finalSize: (finalFileSize / 1024).toFixed(2) + " KB", // Final file size in KB (either original or compressed)
      pdfName: path.basename(finalFilePath), // Name of the final PDF (either original or compressed)
      finalPath: finalFilePath, // Path of the final file
    });
  } catch (error) {
    console.error("Error during file upload:", error);
    res.status(500).json({ error: "Failed to process PDF" });
  }
});

// Serve static files from the uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
