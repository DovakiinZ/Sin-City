import { Link } from "react-router-dom";

const AsciiMainContent = () => {
  const posts = [
    {
      title: "Building ASCII Art Interfaces",
      date: "2024.01.15",
      content: "Exploring the retro charm of terminal-based UIs and how they can inspire modern web design..."
    },
    {
      title: "The Beauty of Monospace Typography",
      date: "2024.01.10", 
      content: "Why monospace fonts create perfect alignment and how they enhance readability in code..."
    },
    {
      title: "Retro Computing Aesthetic",
      date: "2024.01.05",
      content: "A nostalgic journey through early computer interfaces and their lasting design influence..."
    }
  ];

  return (
    <main className="ascii-text flex-1">
      <pre className="ascii-dim mb-6">
{`╔════════════════════════════════════════════════════════════════╗
║                           RECENT POSTS                         ║
╚════════════════════════════════════════════════════════════════╝`}
      </pre>
      
      <div className="space-y-8">
        {posts.map((post, index) => (
          <article key={index} className="ascii-box p-4 bg-secondary/50">
            <pre className="ascii-highlight mb-2">
{`┌── ${post.title} ${'─'.repeat(Math.max(0, 50 - post.title.length))}┐`}
            </pre>
            <div className="ascii-dim mb-3">
              <span>📅 {post.date} │ 👤 DevBlogger │ 📖 5min read</span>
            </div>
            <p className="ascii-text leading-relaxed mb-4">
              {post.content}
            </p>
            <div className="ascii-dim">
              <Link to="/posts" className="ascii-nav-link hover:ascii-highlight transition-colors">
                [Read More →]
              </Link>
            </div>
            <pre className="ascii-dim mt-2">
{`└${'─'.repeat(65)}┘`}
            </pre>
          </article>
        ))}
      </div>
      
      <pre className="ascii-dim mt-8 text-center">
{`┌─────────────────────────────────────────────────────────────────┐
│                         [ END OF POSTS ]                       │
│                     ► Load More Posts ◄                       │
└─────────────────────────────────────────────────────────────────┘`}
      </pre>
    </main>
  );
};

export default AsciiMainContent;
