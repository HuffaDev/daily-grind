"use client";

import dynamic from "next/dynamic";

// Reads the browser's date and storage as it starts, so it only renders on the client.
const FiveCluesLoader = dynamic(() => import("./FiveClues"), { ssr: false });

export default FiveCluesLoader;
