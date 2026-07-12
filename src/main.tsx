import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ClusterEngine from "./ui/ClusterEngine";
import "../app/globals.css";
import "../app/semantic-axes.css";
import "../app/dataset-registry.css";

const root = document.getElementById("root");

if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <ClusterEngine />
  </StrictMode>,
);
