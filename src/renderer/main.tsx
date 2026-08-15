import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Без StrictMode: он дважды монтирует WebGL (skinview3d) и роняет вкладки в серый экран.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
