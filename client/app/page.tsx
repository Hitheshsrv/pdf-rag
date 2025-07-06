import FileUploadComponent from "@/components/file-upload";
import ChatComponent from "@/components/chat";


export default function Home() {
  return (
    <div>
      <div className="min-h-screen w-screen flex">
        <div className="w-[30vw] min-h-screen flex justify-center items-center p-4">
          <FileUploadComponent/>
        </div>
        <div className="w-[70vw] min-h-screen border-l-2">
          <ChatComponent />
        </div>
      </div>
    </div>
  );
}
