import AsciiHeader from "@/components/AsciiHeader";
import AsciiSidebar from "@/components/AsciiSidebar";
import AsciiMainContent from "@/components/AsciiMainContent";
import AsciiFooter from "@/components/AsciiFooter";
import NewPostsBadge from "@/components/NewPostsBadge";

const Index = () => {
  return (
    <div className="min-h-screen min-h-[-webkit-fill-available] bg-background flex flex-col items-center px-2 sm:px-4 py-2 sm:py-4">
      {/* New Posts Notification Badge */}
      <NewPostsBadge />

      <div className="w-full max-w-7xl mx-auto flex-1">
        <AsciiHeader />

        {/* Main content area - sidebar first on mobile (at top), then main content */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
          {/* Sidebar - appears first on mobile */}
          <div className="w-full lg:w-64 flex-shrink-0">
            <AsciiSidebar />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <AsciiMainContent />
          </div>
        </div>

        <AsciiFooter />
      </div>
    </div>
  );
};

export default Index;
