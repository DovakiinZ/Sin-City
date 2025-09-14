import { useState } from "react";
import AsciiHeader from "@/components/AsciiHeader";
import AsciiFooter from "@/components/AsciiFooter";

interface BlogPost {
  id: number;
  title: string;
  type: "Text" | "Image" | "Video" | "Link";
  date: string;
  attachments?: File[];
}

const ManagePosts = () => {
  const [posts, setPosts] = useState<BlogPost[]>([
    { id: 1, title: "Building ASCII Art Interfaces", type: "Text", date: "2024-01-15" },
    { id: 2, title: "Retro Computing Showcase", type: "Image", date: "2024-01-10" },
    { id: 3, title: "Terminal UI Tutorial", type: "Video", date: "2024-01-08" },
    { id: 4, title: "ASCII Art Resources", type: "Link", date: "2024-01-05" }
  ]);

  const [formData, setFormData] = useState({
    title: "",
    type: "Text" as BlogPost["type"],
    content: "",
    attachments: [] as File[]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.trim()) {
      const newPost: BlogPost = {
        id: posts.length + 1,
        title: formData.title,
        type: formData.type,
        date: new Date().toISOString().split('T')[0],
        attachments: formData.attachments
      };
      setPosts([newPost, ...posts]);
      setFormData({ title: "", type: "Text", content: "", attachments: [] });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <AsciiHeader />
        
        <main className="ascii-text">
          <pre className="ascii-highlight mb-6">
{`╔════════════════════════════════════════════════════════════════════════════════╗
║                               BLOG MANAGEMENT                                  ║
║                          > Create & Manage Posts <                            ║
╚════════════════════════════════════════════════════════════════════════════════╝`}
          </pre>

          {/* Form Section */}
          <section className="mb-12">
            <pre className="ascii-dim mb-4">
{`┌─────────────────────────────────────────────────────────────────────────────┐
│                                NEW POST FORM                                │
└─────────────────────────────────────────────────────────────────────────────┘`}
            </pre>
            
            <form onSubmit={handleSubmit} className="ascii-box bg-secondary/30 p-6">
              <div className="space-y-6">
                {/* Title Field */}
                <div>
                  <pre className="ascii-text mb-2">
{`┌── TITLE ${'─'.repeat(66)}┐`}
                  </pre>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full bg-background border border-ascii-border p-3 ascii-text focus:border-ascii-highlight focus:outline-none"
                    placeholder="Enter your post title..."
                  />
                  <pre className="ascii-dim">
{`└${'─'.repeat(73)}┘`}
                  </pre>
                </div>

                {/* Type Field */}
                <div>
                  <pre className="ascii-text mb-2">
{`┌── TYPE ${'─'.repeat(67)}┐`}
                  </pre>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as BlogPost["type"]})}
                    className="w-full bg-background border border-ascii-border p-3 ascii-text focus:border-ascii-highlight focus:outline-none"
                  >
                    <option value="Text">📄 Text Post</option>
                    <option value="Image">🖼️ Image Post</option>
                    <option value="Video">🎥 Video Post</option>
                    <option value="Link">🔗 Link Post</option>
                  </select>
                  <pre className="ascii-dim">
{`└${'─'.repeat(73)}┘`}
                  </pre>
                </div>

                {/* Content Field */}
                <div>
                  <pre className="ascii-text mb-2">
{`┌── CONTENT ${'─'.repeat(63)}┐`}
                  </pre>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    rows={6}
                    className="w-full bg-background border border-ascii-border p-3 ascii-text focus:border-ascii-highlight focus:outline-none resize-none"
                    placeholder="Write your post content here..."
                  />
                  <pre className="ascii-dim">
{`└${'─'.repeat(73)}┘`}
                  </pre>
                </div>

                {/* Attachments Field */}
                <div>
                  <pre className="ascii-text mb-2">
{`┌── ATTACHMENTS ${'─'.repeat(58)}┐`}
                  </pre>
                  <div className="border border-ascii-border p-4 bg-background">
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setFormData({...formData, attachments: files});
                      }}
                      className="w-full ascii-text file:bg-secondary file:border-ascii-border file:border file:px-4 file:py-2 file:ascii-text file:cursor-pointer hover:file:bg-accent"
                    />
                    {formData.attachments.length > 0 && (
                      <div className="mt-3">
                        <pre className="ascii-dim text-xs mb-2">
{`│ Selected Files:`}
                        </pre>
                        {formData.attachments.map((file, index) => (
                          <div key={index} className="ascii-dim text-xs">
                            <span>│ ► {file.name} ({(file.size / 1024).toFixed(1)}KB)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <pre className="ascii-dim">
{`└${'─'.repeat(73)}┘`}
                  </pre>
                </div>

                {/* Submit Button */}
                <div className="text-center">
                  <pre className="ascii-highlight">
{`┌─────────────────────────┐`}
                  </pre>
                  <button
                    type="submit"
                    className="bg-primary text-primary-foreground px-8 py-3 ascii-text hover:bg-accent hover:text-accent-foreground transition-colors border border-ascii-highlight"
                  >
                    ► PUBLISH POST ◄
                  </button>
                  <pre className="ascii-highlight">
{`└─────────────────────────┘`}
                  </pre>
                </div>
              </div>
            </form>
          </section>

          {/* Posts List Section */}
          <section>
            <pre className="ascii-dim mb-4">
{`┌─────────────────────────────────────────────────────────────────────────────┐
│                              RECENT POSTS                                   │
└─────────────────────────────────────────────────────────────────────────────┘`}
            </pre>
            
            <div className="ascii-box bg-secondary/20 p-4">
              <pre className="ascii-highlight mb-4">
{`╔══════╦════════════════════════════════════╦══════════╦════════════╗
║  ID  ║               TITLE                ║   TYPE   ║    DATE    ║
╠══════╬════════════════════════════════════╬══════════╬════════════╣`}
              </pre>
              
              {posts.map((post, index) => {
                const truncatedTitle = post.title.length > 30 
                  ? post.title.substring(0, 30) + "..." 
                  : post.title;
                
                return (
                  <pre key={post.id} className={index % 2 === 0 ? "ascii-text" : "ascii-dim"}>
{`║ ${post.id.toString().padStart(4)} ║ ${truncatedTitle.padEnd(34)} ║ ${post.type.padEnd(8)} ║ ${post.date} ║`}
                  </pre>
                );
              })}
              
              <pre className="ascii-highlight mt-4">
{`╚══════╩════════════════════════════════════╩══════════╩════════════╝`}
              </pre>
              
              <div className="mt-4 text-center ascii-dim">
                <span>Total Posts: {posts.length} │ </span>
                <span className="ascii-nav-link cursor-pointer hover:ascii-highlight transition-colors">
                  [View All]
                </span>
                <span> │ </span>
                <span className="ascii-nav-link cursor-pointer hover:ascii-highlight transition-colors">
                  [Export]
                </span>
              </div>
            </div>
          </section>
        </main>

        <AsciiFooter />
      </div>
    </div>
  );
};

export default ManagePosts;