function Header() {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Neural Cyphers T-100</p>
        <h1>PharmGraph AI</h1>
      </div>
      <nav className="nav" aria-label="Main navigation">
        <a href="#">Home</a>
        <a href="#">Results</a>
        <a href="#">About</a>
      </nav>
    </header>
  );
}

export default Header;
