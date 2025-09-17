// Cicada overlay now uses an image (public/cicada.png)

const AsciiHeader = () => {
  return (
    <header className="ascii-text mb-6">
      <div className="relative">
        <pre className="text-center ascii-highlight font-mono leading-[0.85] text-[18px] sm:text-[22px] md:text-[26px] lg:text-[30px]">
{`╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║     ███████╗██╗███╗   ██╗     ██████╗██╗████████╗██╗   ██╗                     ║
║     ██╔════╝██║████╗  ██║    ██╔════╝██║╚══██╔══╝╚██╗ ██╔╝                     ║
║     ███████╗██║██╔██╗ ██║    ██║     ██║   ██║    ╚████╔╝                      ║
║     ╚════██║██║██║╚██╗██║    ██║     ██║   ██║     ╚██╔╝                       ║
║     ███████║██║██║ ╚████║    ╚██████╗██║   ██║      ██║                        ║
║     ╚══════╝╚═╝╚═╝  ╚═══╝     ╚═════╝╚═╝   ╚═╝      ╚═╝                        ║
║                                                                                ║
╚══════════════════════════════════════════════════════════════════════════════╝`}
        </pre>
      </div>
      {/* Tagline removed per request */}
    </header>
  );
};

export default AsciiHeader;
