import React, { createContext, useContext, useEffect, useState } from 'react';

type Language = 'en' | 'fr';
const translations: Record<string, string> = {
  'Home':'Accueil','Menu':'Menu','Chore Manager':'Gestion des tâches','Boss / Parent':'Responsable / Parent','Worker / Child':'Participant / Enfant',
  'Chores & requests':'Tâches et demandes','Live work sessions':'Sessions de travail','Team chat':'Discussion de l’équipe','Clock in / out':'Pointage','Piggy bank & payouts':'Tirelire et paiements','Workers & invitations':'Participants et invitations','Salary brackets':'Barèmes de salaire','To Buy list':'Liste de courses','Available chores':'Tâches disponibles','My chores':'Mes tâches','NFC & QR badge':'Badge NFC et QR','Savings goals':'Objectifs d’épargne','Request supplies':'Demander du matériel','Profile & settings':'Profil et paramètres','My Teams':'Mes équipes','Current team':'Équipe actuelle','All Teams':'Toutes les équipes','Install app':'Installer l’application','Notifications':'Notifications','No notifications yet.':'Aucune notification pour le moment.','Mark all read':'Tout marquer comme lu','Clear all':'Tout effacer',
  'Your profile':'Votre profil','Manage your personal details and account settings.':'Gérez vos informations personnelles et les paramètres de votre compte.','Personal Information':'Informations personnelles','Your Chore Manager avatar':'Votre avatar Chore Manager','Full name':'Nom complet','Username':'Nom d’utilisateur','Email address':'Adresse e-mail','Account type':'Type de compte','Date of birth':'Date de naissance','Member since':'Membre depuis','Save personal information':'Enregistrer les informations','Account Security':'Sécurité du compte','Phone notifications':'Notifications sur le téléphone','Enable phone notifications':'Activer les notifications','Disable phone notifications':'Désactiver les notifications','Send a test notification':'Envoyer une notification de test','Update password':'Mettre à jour le mot de passe','Payment Settings':'Paramètres de paiement','Frequency':'Fréquence','Weekly':'Chaque semaine','Every two weeks':'Toutes les deux semaines','Monthly':'Chaque mois','Custom':'Personnalisé','Custom rule':'Règle personnalisée','Repeat every number of days':'Répéter tous les X jours','Use a day of the month':'Choisir un jour du mois','Interval (days)':'Intervalle (jours)','Day of month (1–28)':'Jour du mois (1–28)','Save schedule':'Enregistrer la fréquence',
  'Active member':'Membre actif','Open this team':'Ouvrir cette équipe','Leave team':'Quitter l’équipe','Accept':'Accepter','Decline':'Refuser','No teams yet. Invitations will appear in the Invitations tab.':'Aucune équipe. Les invitations apparaîtront dans l’onglet Invitations.','You’re all caught up. No pending invitations.':'Tout est à jour. Aucune invitation en attente.',
  'Total Earned':'Total gagné','Total Paid Out':'Total payé','Clocked In Now':'Pointés actuellement','After photo':'Photo après','Before photo':'Photo avant','Payment time 🎉':'C’est l’heure du paiement 🎉','Request payment':'Demander le paiement','Wait until next period':'Attendre la prochaine période','Earnings Breakdown by Team':'Détail des gains par équipe','Recent Financial Transactions':'Transactions récentes','No transactions recorded yet.':'Aucune transaction pour le moment.','Requested chores (pending request)':'Tâches demandées (en attente)','Waiting for team approval':'En attente de l’approbation de l’équipe','Withdraw':'Retirer la demande','No requests waiting for approval.':'Aucune demande en attente d’approbation.','Chores in progress':'Tâches en cours','In progress':'En cours','No chores in progress right now.':'Aucune tâche en cours.','Completed chores':'Tâches terminées','Completed':'Terminée','No approved chores waiting to start.':'Aucune tâche approuvée en attente de démarrage.','Chore calendar':'Calendrier des tâches','Track what you are saving for':'Suivez vos objectifs d’épargne','Open your attendance badge':'Ouvrir votre badge de présence',
  'No deadline: there is no late penalty. If no deadline is set, the worker must start within 48 hours.':'Sans échéance : aucune pénalité de retard. Sans échéance, le participant doit commencer dans les 48 heures.','Set a completion deadline':'Définir une échéance','Completion deadline (optional)':'Échéance de réalisation (facultative)','Loading Chore Manager...':'Chargement de Chore Manager...','Cancel':'Annuler','Save':'Enregistrer','Delete':'Supprimer','Edit':'Modifier','Close':'Fermer','Search':'Rechercher','Password':'Mot de passe','Log Out':'Déconnexion','Profile':'Profil','Settings':'Paramètres','Team':'Équipe','Boss':'Responsable','Worker':'Participant','No deadline':'Aucune échéance'
};
const frenchToEnglish = new Map(Object.entries(translations).map(([en, fr]) => [fr, en]));
const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: 'en', setLanguage: () => {} });
export const useLanguage = () => useContext(LanguageContext);
function translate(value: string, language: Language) {
  const clean = value.trim();
  const english = frenchToEnglish.get(clean) || clean;
  const translated = translations[english];
  return translated && language === 'fr' ? value.replace(clean, translated) : value;
}
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => localStorage.getItem('chore-manager-language') === 'fr' ? 'fr' : 'en');
  const setLanguage = (next: Language) => { localStorage.setItem('chore-manager-language', next); setLanguageState(next); };
  useEffect(() => {
    document.documentElement.lang = language;
    const update = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const node of nodes) { const next = translate(node.nodeValue || '', language); if (next !== node.nodeValue) node.nodeValue = next; }
      if (root instanceof HTMLElement) {
        for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) for (const attr of ['placeholder','title','aria-label']) { const value = el.getAttribute(attr); if (value) { const next = translate(value, language); if (value !== next) el.setAttribute(attr, next); } }
      }
    };
    update(document.body);
    const observer = new MutationObserver((changes) => changes.forEach((change) => { if (change.type === 'characterData' && change.target.parentElement?.closest('[data-language-switch]')) return; update(change.target.nodeType === Node.TEXT_NODE ? change.target.parentNode! : change.target); }));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
};
