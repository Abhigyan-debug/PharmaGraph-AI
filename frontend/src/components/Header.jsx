const LINKS = [
  ['#/', 'Home'],
  ['#/results', 'Results'],
  ['#/about/limitations', 'Limitations'],
];

function Header({ route }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Neural Cyphers T-100</p>
        <h1>PharmGraph AI</h1>
      </div>
      <nav className="nav" aria-label="Main navigation">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} aria-current={route === href ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export default Header;
