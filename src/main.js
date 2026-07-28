import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root application container.");
}

ReactDOM.createRoot(container).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(App)
  )
);
