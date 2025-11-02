import SwapCard from "@/components/SwapCard";
import { Github } from "lucide-react";

export default function Home() {
  return (
    <div>
      <SwapCard />
      <footer className="flex justify-center items-center py-6 bg-black">
      <a
        href="https://github.com/Resham8/token-swap"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-black bg-white px-2 py-1 rounded-lg hover:text-gray-700 transition"
      >
        <Github size={20} />
        <span>View on GitHub</span>
      </a>
    </footer>
    </div>
  );
}
