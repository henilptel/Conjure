import ImageProcessor from './components/ImageProcessor';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12">
      <main className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center text-zinc-900 dark:text-zinc-100 mb-8">
          Magick.WASM Image Processor
        </h1>
        <ImageProcessor />
      </main>
    </div>
  );
}
