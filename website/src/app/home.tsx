import Footer from "@/components/Footer";
import Header from "@/components/Header";
import HomeSection from "@/components/HomeSection";
import AboutSection from "@/components/AboutSection";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <HomeSection />
      <AboutSection />
      <Footer />
    </main>
  );
}
