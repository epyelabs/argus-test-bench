#!/usr/bin/env node
import { render } from "ink";
import { App } from "./app.js";

// `exitOnCtrlC` lets Ctrl+C always bail out, even mid-capture.
const { waitUntilExit } = render(<App />, { exitOnCtrlC: true });
await waitUntilExit();
