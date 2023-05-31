const express = require("express");
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, "../frontend", "build")));
app.use(express.static(path.join(__dirname, "../frontend", "public")));
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "build", "index.html"));
});

app.listen(process.env.PORT, () => {
  console.log(`Server running at port ${process.env.PORT}`);
});
