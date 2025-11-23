const AsciiHeader = () => {
  return (
    <header className="ascii-text mb-6">
      <div className="relative flex items-center justify-center gap-6">
        {/* Album Cover Image */}
        <div className="hidden sm:block flex-shrink-0">
          <img
            src="/images/sin-city-logo.png"
            alt="Sin City Album Cover"
            className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 rounded-lg border-2 border-ascii-highlight shadow-lg shadow-ascii-highlight/20 hover:shadow-ascii-highlight/40 transition-shadow duration-300"
          />
        </div>

        {/* ASCII Title */}
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
