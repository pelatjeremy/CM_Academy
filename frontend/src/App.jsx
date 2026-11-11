import Activation from './stagiaire/Activation';
import ApiStatus from './components/ApiStatus';
import Formations from './components/Formations';
import Admin from './components/Admin';
import PublicLayout, {PublicNotFound} from './public/PublicLayout';
import FormationDetail from './public/FormationDetail';
import './App.css';

const poles = [
  {
    numero: '01',
    titre: 'Le cheval et son commerce',
    description:
      'Mieux comprendre le marché équin et développer ses compétences pour accompagner les projets de vente et d’achat.',
  },
  {
    numero: '02',
    titre: 'Le cheval et son bien-être',
    description:
      'Approfondir ses connaissances pour mieux comprendre les besoins du cheval et accompagner son quotidien.',
  },
  {
    numero: '03',
    titre: 'Le cavalier et son développement',
    description:
      'Développer ses compétences et progresser dans sa pratique et ses projets équestres.',
  },
];

function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/stagiaire/activation') return <Activation />;
  if (path === '/stagiaire/connexion') return <Admin connexion stagiaire />;
  if (path === '/stagiaire' || /^\/stagiaire\/inscriptions\/[^/]+(?:\/questionnaires\/[^/]+|\/parcours(?:\/[^/]+)?)?$/.test(path)) return <Admin connexion={false} stagiaire />;
  if (path === '/admin/connexion') return <Admin connexion />;
  if (path === '/admin' || path.startsWith('/admin/')) return <Admin connexion={false} />;
  if (path === '/formations') return <PublicLayout title="Nos formations — CMH Academy"><Formations standalone /></PublicLayout>;
  const detail = path.match(/^\/formations\/([^/]+)$/);
  if (detail) {
    let slug;try{slug=decodeURIComponent(detail[1]);}catch{return <PublicNotFound/>;}
    return <FormationDetail slug={slug}/>;
  }
  if (path !== '') return <PublicNotFound/>;
  return (
    <PublicLayout>
        {import.meta.env.DEV && <ApiStatus />}
        <section className="hero" aria-labelledby="hero-title">
          <div className="container">
            <p className="eyebrow">Formation • Monde équestre</p>

            <h1 id="hero-title">
              Des connaissances pour faire avancer vos projets équestres.
            </h1>

            <p className="hero-description">
              CMH Academy vous accompagne autour de trois domaines : le commerce
              du cheval, son bien-être et le développement du cavalier.
            </p>

            <a className="button" href="#poles">
              Découvrir nos pôles
            </a>
          </div>
        </section>

        <section
          className="poles-section"
          id="poles"
          aria-labelledby="poles-title"
        >
          <div className="container">
            <p className="eyebrow">Nos domaines</p>
            <h2 id="poles-title">Trois pôles de formation</h2>

            <p className="section-description">
              Une offre organisée autour du cheval, de son environnement et des
              personnes qui l’accompagnent.
            </p>

            <div className="poles-grid">
              {poles.map((pole) => (
                <article className="pole-card" key={pole.numero}>
                  <span className="pole-number" aria-hidden="true">
                    {pole.numero}
                  </span>

                  <h3>{pole.titre}</h3>
                  <p>{pole.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <Formations />
    </PublicLayout>
  );
}

export default App;
