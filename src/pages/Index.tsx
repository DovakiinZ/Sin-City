import AsciiHeader from "@/components/AsciiHeader";
import AsciiSidebar from "@/components/AsciiSidebar";
import AsciiMainContent from "@/components/AsciiMainContent";
import AsciiFooter from "@/components/AsciiFooter";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-7xl mx-auto">
        <AsciiHeader />

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-64 flex-shrink-0">
            <AsciiSidebar />
          </div>

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
