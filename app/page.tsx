import ImageProcessor from './components/ImageProcessor';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 py-12 px-4">
      <main className="container mx-auto max-w-4xl">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
            Magick.WASM Image Processor
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 text-lg">
            Client-side image processing powered by ImageMagick WebAssembly
          </p>
        </header>
        <ImageProcessor />
        <footer className="mt-12 text-center text-sm text-zinc-500 dark:text-zinc-500">
          <p>All image processing happens locally in your browser</p>
        </footer>
      </main>
    </div>
  );
}
