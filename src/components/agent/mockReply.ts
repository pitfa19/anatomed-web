const REPLIES = [
  `Dobro pitanje. **Fissura orbitalis superior** spaja srednju lubanjsku jamu (fossa cranii media) s orbitom. Kroz nju prolaze:\n\n- n. oculomotorius (III)\n- n. trochlearis (IV)\n- n. ophthalmicus (V1) sa svojim ograncima\n- n. abducens (VI)\n- v. ophthalmica superior\n\n_Napomena: ovo je placeholder odgovor - backend nije spojen._`,
  `Pogledao sam **Skriptu A1** i **Hand-Out**: termin se pojavljuje na više stranica. Predlažem otvoriš /docs i pretražiš direktno - tamo ćeš dobiti sve pojave istaknute.\n\n_(mock odgovor)_`,
  `Kratko:\n\n1. **Neurocranium** - moždana lubanja\n2. **Viscerocranium** - lubanja lica\n\nObje su pokrivene u Ponavljanju (/revise/teorija → Lubanja).\n\n_(mock odgovor)_`,
  `Zanimljivo. Trebao bi razgraničiti **m. levator scapulae** od trapeza - funkcija je djelomično preklapajuća, ali inervacija je drugačija (n. dorsalis scapulae vs. n. accessorius).\n\n_(mock - nije pravi LLM odgovor)_`,
  `Mogu ti pomoći:\n\n- Objasniti pojam\n- Otvoriti relevantnu stranicu skripte\n- Generirati pitanja za ponavljanje\n\nKaži što ti treba.\n\n_(placeholder)_`,
];

let cursor = 0;

export function nextMockReply(): string {
  const r = REPLIES[cursor % REPLIES.length];
  cursor += 1;
  return r;
}
