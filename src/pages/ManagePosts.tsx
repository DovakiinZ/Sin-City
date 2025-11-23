import { useState } from "react";
import AsciiHeader from "@/components/AsciiHeader";
import AsciiFooter from "@/components/AsciiFooter";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import { useSupabasePosts, createPost, deletePost, type Post } from "@/hooks/useSupabasePosts";
import { useToast } from "@/hooks/use-toast";

const ManagePosts = () => {
  const { user } = useAuth();
  const { posts, loading, error } = useSupabasePosts();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: "",
    type: "Text" as Post["type"],
    content: "",
    draft: false,
  });

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Title is required",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      await createPost({
        title: formData.title,
        type: formData.type,
        content: formData.content,
        draft: formData.draft,
        author_name: user?.displayName || "Anonymous",
        author_email: user?.email || "",
        user_id: user?.uid,
      });

      toast({
        title: "Success",
        description: "Post created successfully!",
      });

      // Reset form
      setFormData({
        title: "",
        type: "Text",
        content: "",
        draft: false,
      });
    } catch (err) {
      console.error("Error creating post:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create post",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      await deletePost(id);
      toast({
        title: "Success",
        description: "Post deleted successfully!",
      });
    } catch (err) {
      console.error("Error deleting post:", err);
      toast({
        title: "Error",
        description: "Failed to delete post",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-7xl mx-auto">
        <AsciiHeader />
        <div className="mb-4"><BackButton /></div>
        <main className="ascii-text">
          <pre className="ascii-highlight mb-6">
            {`╔═══════════════════════════════════════════════════════════════════════════════╗
║                               BLOG MANAGEMENT                                  ║
║                          > Create & Manage Posts <                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝`}
          </pre>

          {/* Form Section */}
          <section className="mb-12">
            <pre className="ascii-dim mb-4">
              {`┌───────────────────────────────────────────────────────────────────────────┐
│                                NEW POST FORM                                │
└───────────────────────────────────────────────────────────────────────────┘`}
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
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Post["type"] })}
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
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    rows={6}
                    className="w-full bg-background border border-ascii-border p-3 ascii-text focus:border-ascii-highlight focus:outline-none resize-none"
                    placeholder="Write your post content here..."
                  />
                  <pre className="ascii-dim">
                    {`└${'─'.repeat(73)}┘`}
                  </pre>
                </div>

                {/* Draft Toggle */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="draft"
                    checked={formData.draft}
                    onChange={(e) => setFormData({ ...formData, draft: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="draft" className="ascii-text">Save as draft</label>
                </div>

                {/* Submit Button */}
                <div className="text-center">
                  <pre className="ascii-highlight">
                    {`┌─────────────────────────┐`}
                  </pre>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-primary text-primary-foreground px-8 py-3 ascii-text hover:bg-accent hover:text-accent-foreground transition-colors border border-ascii-highlight disabled:opacity-50"
                  >
                    {submitting ? "► PUBLISHING..." : "► PUBLISH POST ◄"}
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
              {`┌───────────────────────────────────────────────────────────────────────────┐
│                              RECENT POSTS                                   │
└───────────────────────────────────────────────────────────────────────────┘`}
            </pre>

            <div className="ascii-box bg-secondary/20 p-4">
              {loading ? (
                <pre className="ascii-text text-center">
                  {`Loading posts... <span className="ascii-spinner"></span>`}
                </pre>
              ) : error ? (
                <pre className="ascii-text text-center text-red-500">
                  {`Error: ${error}`}
                </pre>
              ) : posts.length === 0 ? (
                <pre className="ascii-dim text-center">
                  {`No posts yet. Create your first post above!`}
                </pre>
              ) : (
                <>
                  <pre className="ascii-highlight mb-4">
                    {`╔═══════╦═══════════════════════════════════╦══════════╦═════════════╗
║  ID   ║               TITLE                ║   TYPE   ║    DATE     ║
╠═══════╬═══════════════════════════════════╬══════════╬═════════════╣`}
                  </pre>

                  {posts.slice(0, 10).map((post, index) => {
                    const truncatedTitle = post.title.length > 30
                      ? post.title.substring(0, 30) + "..."
                      : post.title;
                    const shortId = post.id.substring(0, 5);
                    const formattedDate = new Date(post.created_at).toISOString().split('T')[0];

                    return (
                      <div key={post.id} className="group">
                        <pre className={index % 2 === 0 ? "ascii-text" : "ascii-dim"}>
                          {`║ ${shortId.padEnd(5)} ║ ${truncatedTitle.padEnd(34)} ║ ${post.type.padEnd(8)} ║ ${formattedDate} ║`}
                        </pre>
                        {user?.uid === post.user_id && (
                          <div className="ml-4 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleDelete(post.id)}
                              className="ascii-text text-xs hover:ascii-highlight"
                            >
                              [DELETE]
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <pre className="ascii-highlight mt-4">
                    {`╚═══════╩═══════════════════════════════════╩══════════╩═════════════╝`}
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
                </>
              )}
            </div>
          </section>
        </main>

        <AsciiFooter />
      </div>
    </div>
  );
};

export default ManagePosts;
