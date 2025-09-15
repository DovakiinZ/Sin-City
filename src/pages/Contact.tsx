import AsciiHeader from "@/components/AsciiHeader";
import AsciiSidebar from "@/components/AsciiSidebar";
import AsciiFooter from "@/components/AsciiFooter";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <AsciiHeader />

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-64 flex-shrink-0">
            <AsciiSidebar />
          </div>

          <main className="flex-1 min-w-0 ascii-text">
            <pre className="ascii-dim mb-4">{`+---------------------+\n|      CONTACT       |\n+---------------------+`}</pre>
            <p className="mb-2">Questions, ideas, or feedback?</p>
            <p className="mb-2">
              Reach me at <span className="ascii-highlight">v4xd@outlook.sa</span> or ping me on socials.
            </p>
            <p>Responses are handled by a friendly terminal daemon.</p>
          </main>
        </div>

        <AsciiFooter />
      </div>
    </div>
  );
};

export default Contact;

