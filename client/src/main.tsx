import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTokensToRoot } from "@/lib/design-tokens";

// Apply runtime design tokens as CSS variables for immediate theming
applyTokensToRoot();

createRoot(document.getElementById("root")!).render(<App />);
