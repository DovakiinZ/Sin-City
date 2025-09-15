import AsciiHeader from "@/components/AsciiHeader";
import AsciiSidebar from "@/components/AsciiSidebar";
import AsciiFooter from "@/components/AsciiFooter";

const About = () => {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <AsciiHeader />

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-64 flex-shrink-0">
            <AsciiSidebar />
          </div>

          <main className="flex-1 min-w-0 ascii-text">
            <pre className="ascii-dim mb-4">{`+---------------------+\n|       ABOUT        |\n+---------------------+`}</pre>
            <p className="mb-2">
              Welcome to Sin City — an ASCII-styled blog and playground.
            </p>
            <p className="mb-2">
              This project explores retro aesthetics, markdown posts, and a
              terminal-inspired UI.
            </p>
            <p>Built with React, Vite, Tailwind, and a lot of nostalgia.</p>
          </main>
        </div>

        <AsciiFooter />
      </div>
    </div>
  );
};

export default About;

