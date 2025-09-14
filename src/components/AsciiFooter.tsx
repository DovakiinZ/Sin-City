const AsciiFooter = () => {
  return (
    <footer className="ascii-text mt-12">
      <pre className="ascii-dim text-center">
{`╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║  © 2024 DevBlog │ Made with ♥ and ASCII │ Powered by Terminal Nostalgia    ║
║                                                                              ║
║  [GitHub] │ [Twitter] │ [LinkedIn] │ [RSS] │ [Email: dev@ascii-blog.com]   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝`}
      </pre>
      <div className="text-center mt-4 ascii-dim text-xs">
        <span>{"System Status: "}
          <span className="ascii-highlight">ONLINE</span>
          {" │ Uptime: 99.9% │ Server: Terminal-01"}
        </span>
      </div>
    </footer>
  );
};

export default AsciiFooter;