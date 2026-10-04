import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./editor.css";
import "./sakura.css";
import Sakura from "./Sakura";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <Sakura />
    <App />
  </>,
);
import "./enhancements.css";
