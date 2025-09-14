const AsciiHeader = () => {
  return (
    <header className="ascii-text mb-6">
      <pre className="text-center ascii-highlight">
{`╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║     ███████╗██╗███╗   ██╗     ██████╗██╗████████╗██╗   ██╗                  ║
║     ██╔════╝██║████╗  ██║    ██╔════╝██║╚══██╔══╝╚██╗ ██╔╝                  ║
║     ███████╗██║██╔██╗ ██║    ██║     ██║   ██║    ╚████╔╝                   ║
║     ╚════██║██║██║╚██╗██║    ██║     ██║   ██║     ╚██╔╝                    ║
║     ███████║██║██║ ╚████║    ╚██████╗██║   ██║      ██║                     ║
║     ╚══════╝╚═╝╚═╝  ╚═══╝     ╚═════╝╚═╝   ╚═╝      ╚═╝                     ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝`}
      </pre>
      <div className="text-center mt-4 ascii-dim">
        <span>{">> Welcome to the Dark Side of Digital Content <<"}</span>
        <div className="mt-2 text-xs">
          <span>Designed and created by: </span>
          <span className="ascii-highlight">Dovakiin</span>
        </div>
      </div>
    </header>
  );
};

export default AsciiHeader;