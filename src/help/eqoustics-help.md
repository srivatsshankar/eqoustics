# Eqoustics Help

Eqoustics is a notebook-style mathematics editor. Each row is stored as LaTeX in the background and displayed as readable notation in the editor.

## Documents

- Use `File > New Document` to start a blank notebook.
- Use `File > Open Existing Document` to open a saved `.tex` notebook.
- Use `File > Save File` to save the current notebook.
- Use `File > Save As` to save a copy or choose a new file location.
- Use `File > Export As > PDF` to export a printable PDF.
- Use `File > Export As > LaTeX` to save the notebook as a LaTeX `.tex` file.
- Recent files appear in the File menu. Select one to reopen it quickly.

## Editing

- Type directly into the active row.
- Use the row controls to add, move, or remove rows.
- Use `Edit > Undo` and `Edit > Redo` to move backward and forward through document changes.
- Use `Edit > Cut`, `Copy`, and `Paste` for normal clipboard work.
- Use `Edit > Copy As` to copy selected rows as LaTeX, notation, PNG, or JPEG.

## Mathematical notation

- The notation toolbar inserts common math structures and symbols.
- Use fractions for expressions like `\frac{x+1}{2}`.
- Use powers for exponents like `x^2` and subscripts like `a_n`.
- Use roots for square roots and indexed roots, such as `\sqrt{x}` and `\sqrt[3]{x}`.
- Use relation symbols such as `=`, `<`, `>`, `\leq`, and `\geq`.
- Use Greek letters such as `\alpha`, `\beta`, `\theta`, and `\pi`.
- Use matrices and cases from the toolbar when expressions need rows and columns.

## Formatting

- Use the bold, italic, and underline buttons for inline text formatting.
- Use heading buttons `H1` through `H4` to structure a notebook.
- Use bullet and numbered list buttons for list formatting.
- Use the hyperlink button to add a link to selected text.

## Microphone

The floating microphone window controls speech recognition. Click the microphone to start listening. Eqoustics records speech chunks, sends them to Gemma, then inserts the result into the active row.

When speech starts for the first time, Gemma may need to load. If the selected runtime uses Transformers, the Gemma model may also need to download from Hugging Face into the local cache. Loading or downloading can take time, especially on first run. The speech control shows progress while the model is preparing.

## Speech commands

Speech commands control the notebook without typing. Open the `Commands` menu to see the live command list and aliases. Common commands include:

- `new line`, `newline`, `new row`, or `next line` to create a row below the current row.
- `new paragraph` or `next paragraph` to create a blank row for a new paragraph.
- `go to row five`, `go to line five`, `select row five`, or `select line five` to move to a numbered row.
- `silence` to keep the microphone active while ignoring dictation.
- `listen` to resume processing after silence mode.
- `deactivate microphone`, `disable microphone`, `turn off microphone`, or `stop listening` to turn speech recognition off.

## Dictating LaTeX

Speak mathematical expressions naturally. Eqoustics asks Gemma to convert math dictation to LaTeX, then inserts the rendered notation.

- Say `x squared over two minus three` to insert a fraction and exponent.
- Say `x equals y` to insert an equation.
- Say `plus five` to append an operator expression.
- Say `make that a plus instead of minus` to correct the current row when the command depends on existing row content.

## Dictating text

If speech is plain non-math prose, Eqoustics inserts it as text instead of LaTeX. For example, saying `that is the conclusion of the proof` inserts normal text into the active row.

If Gemma returns math, Eqoustics inserts LaTeX notation. If Gemma returns text, Eqoustics inserts text. If the result is a command, Eqoustics runs the command instead of inserting content.

## Mathematical notation reference

This table is generated from the toolbar source by `scripts/update-help-notation-table.mjs`. Run it after changing toolbar notation definitions.

| Notation as shown | Called | LaTeX inserted | Menu |
| --- | --- | --- | --- |
| □/□ | Fraction | `\frac{□}{□}` | Quick notation |
| √□ | Square root | `\sqrt` | Quick notation |
| ⁿ√□ | Indexed root | `\sqrt[]` | Quick notation |
| x^□ | Power / exponent | `^` | Quick notation |
| x_□ | Subscript | `_` | Quick notation |
| □ under x | Lower bound | `\underset` | Quick notation |
| □ over x | Upper bound | `\overset` | Quick notation |
| □ over and under x | Lower and upper bounds | `\bothset` | Quick notation |
| \|□\| | Absolute value | `\left\lvert{□}\right\rvert` | Quick notation |
| (□) | Parentheses | `\left({□}\right)` | Quick notation |
| [□] | Brackets | `\left[{□}\right]` | Quick notation |
| {□} | Curly braces | `\left\lbrace{□}\right\rbrace` | Quick notation |
| + | Plus | `+` | Arithmetic |
| - | Minus | `-` | Arithmetic |
| × | Multiplication (cross) | `\times` | Arithmetic |
| · | Multiplication (dot) | `\cdot` | Arithmetic |
| ÷ | Division | `\div` | Arithmetic |
| ∂ | Partial derivative | `\partial` | Calculus |
| ∇ | Nabla / Del | `\nabla` | Calculus |
| ∞ | Infinity | `\infty` | Calculus |
| dy/dx | Derivative | `\frac{dy}{dx}` | Calculus |
| \int_{ }^{ } | Definite integral — type the bounds | `\int_{ }^{ }` | Calculus |
| Custom | Plain matrix with custom delimiters | `\begin{matrix} □ & □ \\ □ & □ \end{matrix}` | Matrix environments |
| matrix | Plain matrix with no brackets | `\begin{matrix} □ & □ \\ □ & □ \end{matrix}` | Matrix environments |
| pmatrix | Matrix with parentheses | `\begin{pmatrix} □ & □ \\ □ & □ \end{pmatrix}` | Matrix environments |
| bmatrix | Matrix with square brackets | `\begin{bmatrix} □ & □ \\ □ & □ \end{bmatrix}` | Matrix environments |
| vmatrix | Matrix with single vertical bars | `\begin{vmatrix} □ & □ \\ □ & □ \end{vmatrix}` | Matrix environments |
| Vmatrix | Matrix with double vertical bars | `\begin{Vmatrix} □ & □ \\ □ & □ \end{Vmatrix}` | Matrix environments |
| Bmatrix | Matrix with curly braces | `\begin{Bmatrix} □ & □ \\ □ & □ \end{Bmatrix}` | Matrix environments |
| smallmatrix | Compact inline matrix | `\begin{smallmatrix} □ & □ \\ □ & □ \end{smallmatrix}` | Matrix environments |
| array | Column-aligned array with column spec | `\begin{array}{ccc} □ & □ \\ □ & □ \end{array}` | Matrix environments |
| dotted | Array with dotted cell dividers | `\begin{array}{ccc} □ & □ \\ □ & □ \end{array}` | Matrix environments |
| None | Matrix delimiter: None | `no delimiter` | Matrix delimiters |
| Parentheses | Matrix delimiter: Parentheses | `\left( ... \right)` | Matrix delimiters |
| Brackets | Matrix delimiter: Brackets | `\left[ ... \right]` | Matrix delimiters |
| Braces | Matrix delimiter: Braces | `\left\lbrace ... \right\rbrace` | Matrix delimiters |
| Angles | Matrix delimiter: Angles | `\left\langle ... \right\rangle` | Matrix delimiters |
| Vertical bars | Matrix delimiter: Vertical bars | `\left\lvert ... \right\rvert` | Matrix delimiters |
| Double bars | Matrix delimiter: Double bars | `\left\lVert ... \right\rVert` | Matrix delimiters |
| Ceiling | Matrix delimiter: Ceiling | `\left\lceil ... \right\rceil` | Matrix delimiters |
| Floor | Matrix delimiter: Floor | `\left\lfloor ... \right\rfloor` | Matrix delimiters |
| Groups | Matrix delimiter: Groups | `\left\lgroup ... \right\rgroup` | Matrix delimiters |
| Moustaches | Matrix delimiter: Moustaches | `\left\lmoustache ... \right\rmoustache` | Matrix delimiters |
| Upper corners | Matrix delimiter: Upper corners | `\left\ulcorner ... \right\urcorner` | Matrix delimiters |
| Lower corners | Matrix delimiter: Lower corners | `\left\llcorner ... \right\lrcorner` | Matrix delimiters |
| Double brackets | Matrix delimiter: Double brackets | `\left\llbracket ... \right\rrbracket` | Matrix delimiters |
| Up arrows | Matrix delimiter: Up arrows | `\left\uparrow ... \right\uparrow` | Matrix delimiters |
| Down arrows | Matrix delimiter: Down arrows | `\left\downarrow ... \right\downarrow` | Matrix delimiters |
| Up-down arrows | Matrix delimiter: Up-down arrows | `\left\updownarrow ... \right\updownarrow` | Matrix delimiters |
| Double up arrows | Matrix delimiter: Double up arrows | `\left\Uparrow ... \right\Uparrow` | Matrix delimiters |
| Double down arrows | Matrix delimiter: Double down arrows | `\left\Downarrow ... \right\Downarrow` | Matrix delimiters |
| Double up-down arrows | Matrix delimiter: Double up-down arrows | `\left\Updownarrow ... \right\Updownarrow` | Matrix delimiters |
| Auto | Matrix delimiter size: Auto | `\left ... \right` | Matrix delimiter sizes |
| Small | Matrix delimiter size: Small | `\bigl ... \bigr` | Matrix delimiter sizes |
| Medium | Matrix delimiter size: Medium | `\Bigl ... \Bigr` | Matrix delimiter sizes |
| Large | Matrix delimiter size: Large | `\biggl ... \biggr` | Matrix delimiter sizes |
| Largest | Matrix delimiter size: Largest | `\Biggl ... \Biggr` | Matrix delimiter sizes |
| cases | Left-braced cases | `\begin{cases} □ & \text{if } □ \\ □ & \text{if } □ \end{cases}` | Cases |
| rcases | Right-braced cases | `\begin{rcases} □ & \text{if } □ \\ □ & \text{if } □ \end{rcases}` | Cases |
| α | Alpha | `\alpha` | Greek |
| β | Beta | `\beta` | Greek |
| γ | Gamma | `\gamma` | Greek |
| δ | Delta | `\delta` | Greek |
| ε | Epsilon | `\epsilon` | Greek |
| ϵ | Variant epsilon | `\varepsilon` | Greek |
| ζ | Zeta | `\zeta` | Greek |
| η | Eta | `\eta` | Greek |
| θ | Theta | `\theta` | Greek |
| ϑ | Variant theta | `\vartheta` | Greek |
| ι | Iota | `\iota` | Greek |
| κ | Kappa | `\kappa` | Greek |
| ϰ | Variant kappa | `\varkappa` | Greek |
| λ | Lambda | `\lambda` | Greek |
| μ | Mu | `\mu` | Greek |
| ν | Nu | `\nu` | Greek |
| o | Omicron | `o` | Greek |
| ξ | Xi | `\xi` | Greek |
| π | Pi | `\pi` | Greek |
| ϖ | Variant pi | `\varpi` | Greek |
| ρ | Rho | `\rho` | Greek |
| ϱ | Variant rho | `\varrho` | Greek |
| σ | Sigma | `\sigma` | Greek |
| ς | Final sigma | `\varsigma` | Greek |
| τ | Tau | `\tau` | Greek |
| υ | Upsilon | `\upsilon` | Greek |
| φ | Phi | `\phi` | Greek |
| ϕ | Variant phi | `\varphi` | Greek |
| χ | Chi | `\chi` | Greek |
| ψ | Psi | `\psi` | Greek |
| ω | Omega | `\omega` | Greek |
| ϝ | Digamma | `\digamma` | Greek |
| Γ | Gamma (upper) | `\Gamma` | Greek |
| Δ | Delta (upper) | `\Delta` | Greek |
| Θ | Theta (upper) | `\Theta` | Greek |
| Λ | Lambda (upper) | `\Lambda` | Greek |
| Ξ | Xi (upper) | `\Xi` | Greek |
| Π | Pi (upper) | `\Pi` | Greek |
| Σ | Sigma (upper) | `\Sigma` | Greek |
| Υ | Upsilon (upper) | `\Upsilon` | Greek |
| Φ | Phi (upper) | `\Phi` | Greek |
| Ψ | Psi (upper) | `\Psi` | Greek |
| Ω | Omega (upper) | `\Omega` | Greek |
| ℵ | Aleph | `\aleph` | Greek |
| ℶ | Beth | `\beth` | Greek |
| ℷ | Gimel | `\gimel` | Greek |
| ℸ | Daleth | `\daleth` | Greek |
| ı | Dotless i | `\imath` | Greek |
| ȷ | Dotless j | `\jmath` | Greek |
| ∇ | Nabla | `\nabla` | Greek |
| ∂ | Partial derivative | `\partial` | Greek |
| ℑ | Imaginary part | `\Im` | Greek |
| ℑ | Imaginary part | `\image` | Greek |
| ℜ | Real part | `\Re` | Greek |
| ℜ | Real part | `\real` | Greek |
| ℝ | Real numbers | `\Reals` | Greek |
| ℝ | Real numbers | `\R` | Greek |
| ℝ | Real numbers | `\reals` | Greek |
| ℕ | Natural numbers | `\N` | Greek |
| ℕ | Natural numbers | `\natnums` | Greek |
| ℤ | Integers | `\Z` | Greek |
| ℂ | Complex numbers | `\cnums` | Greek |
| ℂ | Complex numbers | `\Complex` | Greek |
| 𝕜 | Blackboard bold k | `\Bbbk` | Greek |
| ℓ | Script ell | `\ell` | Greek |
| ℏ | h-bar | `\hbar` | Greek |
| ℏ | h-slash | `\hslash` | Greek |
| ℘ | Weierstrass p | `\wp` | Greek |
| ℘ | Weierstrass p | `\weierp` | Greek |
| ⅁ | Game | `\Game` | Greek |
| Ⅎ | Turned F | `\Finv` | Greek |
| ð | Eth | `\eth` | Greek |
| Œ | OE ligature | `\OE` | Greek |
| ø | o slash | `\o` | Greek |
| Ø | O slash | `\O` | Greek |
| ß | Eszett | `\ss` | Greek |
| å | a ring | `\aa` | Greek |
| Å | A ring | `\AA` | Greek |
| ı | Dotless i | `\i` | Greek |
| ȷ | Dotless j | `\j` | Greek |
| æ | ae ligature | `\ae` | Greek |
| Æ | AE ligature | `\AE` | Greek |
| œ | oe ligature | `\oe` | Greek |
| ℵ | Aleph | `\alef` | Greek |
| ℵ | Aleph | `\alefsym` | Greek |
| A | Alpha | `\Alpha` | Greek |
| B | Beta | `\Beta` | Greek |
| E | Epsilon | `\Epsilon` | Greek |
| Z | Zeta | `\Zeta` | Greek |
| H | Eta | `\Eta` | Greek |
| I | Iota | `\Iota` | Greek |
| K | Kappa | `\Kappa` | Greek |
| M | Mu | `\Mu` | Greek |
| N | Nu | `\Nu` | Greek |
| O | Omicron | `\Omicron` | Greek |
| P | Rho | `\Rho` | Greek |
| T | Tau | `\Tau` | Greek |
| X | Chi | `\Chi` | Greek |
| o | omicron | `\omicron` | Greek |
| ϑ | thetasym | `\thetasym` | Greek |
| Γ | varGamma | `\varGamma` | Greek |
| Δ | varDelta | `\varDelta` | Greek |
| Θ | varTheta | `\varTheta` | Greek |
| Λ | varLambda | `\varLambda` | Greek |
| Ξ | varXi | `\varXi` | Greek |
| Π | varPi | `\varPi` | Greek |
| Σ | varSigma | `\varSigma` | Greek |
| Υ | varUpsilon | `\varUpsilon` | Greek |
| Φ | varPhi | `\varPhi` | Greek |
| Ψ | varPsi | `\varPsi` | Greek |
| Ω | varOmega | `\varOmega` | Greek |
| tilde | Tilde | `\tilde{ }` | Accents |
| widetilde | Wide tilde | `\widetilde{ }` | Accents |
| acute | Acute accent | `\acute{ }` | Accents |
| bar | Bar / macron | `\bar{ }` | Accents |
| breve | Breve | `\breve{ }` | Accents |
| check | Check / caron | `\check{ }` | Accents |
| dot | Dot above | `\dot{ }` | Accents |
| ddot | Double dot / umlaut | `\ddot{ }` | Accents |
| dddot | Triple dot | `\dddot{ }` | Accents |
| ddddot | Quadruple dot | `\ddddot{ }` | Accents |
| grave | Grave accent | `\grave{ }` | Accents |
| hat | Hat / circumflex | `\hat{ }` | Accents |
| widehat | Wide hat | `\widehat{ }` | Accents |
| mathring | Ring above | `\mathring{ }` | Accents |
| vec | Vector arrow | `\vec{ }` | Accents |
| overline | Overline | `\overline{ }` | Accents |
| underline | Underline | `\underline{ }` | Accents |
| underbar | Underbar | `\underbar{ }` | Accents |
| overbrace | Overbrace with label | `\overbrace{ }^{ }` | Accents |
| underbrace | Underbrace with label | `\underbrace{ }_{ }` | Accents |
| overbracket | Overbracket with label | `\overbracket{ }^{ }` | Accents |
| overbrace | Overbrace without label | `\overbrace{ }` | Accents |
| underbrace | Underbrace without label | `\underbrace{ }` | Accents |
| overbracket | Overbracket without label | `\overbracket{ }` | Accents |
| overleftarrow | Left arrow over | `\overleftarrow{ }` | Accents |
| overrightarrow | Right arrow over | `\overrightarrow{ }` | Accents |
| underleftarrow | Left arrow under | `\underleftarrow{ }` | Accents |
| underrightarrow | Right arrow under | `\underrightarrow{ }` | Accents |
| overleftrightarrow | Bidirectional arrow over | `\overleftrightarrow{ }` | Accents |
| underleftrightarrow | Bidirectional arrow under | `\underleftrightarrow{ }` | Accents |
| overleftharpoon | Left harpoon over | `\overleftharpoon{ }` | Accents |
| overrightharpoon | Right harpoon over | `\overrightharpoon{ }` | Accents |
| acute' | Acute accent | `\'{ }` | Accents |
| grave` | Grave accent | `\`{ }` | Accents |
| hat^ | Circumflex / hat | `\^{ }` | Accents |
| tilde~ | Tilde | `\~{ }` | Accents |
| macron= | Macron / bar | `\={ }` | Accents |
| breveu | Breve | `\u{ }` | Accents |
| dot. | Dot above | `\.{ }` | Accents |
| ringr | Ring above | `\r{ }` | Accents |
| doubleacuteH | Double acute | `\H{ }` | Accents |
| caronv | Caron / check | `\v{ }` | Accents |
| umlaut" | Umlaut / double dot | `\"{ }` | Accents |
| cancel □ | cancel | `\cancel{□}` | Accents |
| bcancel □ | bcancel | `\bcancel{□}` | Accents |
| xcancel □ | xcancel | `\xcancel{□}` | Accents |
| sout □ | sout | `\sout{□}` | Accents |
| phase □ | phase | `\phase{□}` | Accents |
| angln □ | angln | `\angln{□}` | Accents |
| \Bigl({#?}\Bigr) | Parentheses | `\Bigl({□}\Bigr)` | Delimiters |
| \Bigl[{#?}\Bigr] | Brackets | `\Bigl[{□}\Bigr]` | Delimiters |
| \Bigl\lbrace{#?}\Bigr\rbrace | Braces | `\Bigl\lbrace{□}\Bigr\rbrace` | Delimiters |
| \Bigl\langle{#?}\Bigr\rangle | Angles | `\Bigl\langle{□}\Bigr\rangle` | Delimiters |
| \Bigl\lvert{#?}\Bigr\rvert | Bars | `\Bigl\lvert{□}\Bigr\rvert` | Delimiters |
| \Bigl\lVert{#?}\Bigr\rVert | Double bars | `\Bigl\lVert{□}\Bigr\rVert` | Delimiters |
| \Bigl\lceil{#?}\Bigr\rceil | Ceiling | `\Bigl\lceil{□}\Bigr\rceil` | Delimiters |
| \Bigl\lfloor{#?}\Bigr\rfloor | Floor | `\Bigl\lfloor{□}\Bigr\rfloor` | Delimiters |
| \Bigl\llbracket{#?}\Bigr\rrbracket | Double brackets | `\Bigl\llbracket{□}\Bigr\rrbracket` | Delimiters |
| Small | Delimiter size: Small | `\bigl ... \bigr` | Delimiters |
| Medium | Delimiter size: Medium | `\Bigl ... \Bigr` | Delimiters |
| Large | Delimiter size: Large | `\biggl ... \biggr` | Delimiters |
| Largest | Delimiter size: Largest | `\Biggl ... \Biggr` | Delimiters |
| \ | Backslash | `\backslash` | Delimiters |
| ∑ | sum | `\sum` | Operators |
| ∏ | prod | `\prod` | Operators |
| ∐ | coprod | `\coprod` | Operators |
| ∫ | int | `\int` | Operators |
| ∫ | intop | `\intop` | Operators |
| ∫ | smallint | `\smallint` | Operators |
| ∬ | iint | `\iint` | Operators |
| ∭ | iiint | `\iiint` | Operators |
| ∮ | oint | `\oint` | Operators |
| ∯ | oiint | `\oiint` | Operators |
| ∰ | oiiint | `\oiiint` | Operators |
| ⨂ | bigotimes | `\bigotimes` | Operators |
| ⨁ | bigoplus | `\bigoplus` | Operators |
| ⨀ | bigodot | `\bigodot` | Operators |
| ⨄ | biguplus | `\biguplus` | Operators |
| ⨆ | bigsqcup | `\bigsqcup` | Operators |
| ⋁ | bigvee | `\bigvee` | Operators |
| ⋀ | bigwedge | `\bigwedge` | Operators |
| ⋂ | bigcap | `\bigcap` | Operators |
| ⋃ | bigcup | `\bigcup` | Operators |
| + | Plus (+) | `+` | Operators |
| · | cdot | `\cdot` | Operators |
| ⋗ | gtrdot | `\gtrdot` | Operators |
| {#?} \pmod{#?} | pmod with slots | `{□} \pmod{□}` | Operators |
| - | Minus (-) | `-` | Operators |
| · | cdotp | `\cdotp` | Operators |
| ⊺ | intercal | `\intercal` | Operators |
| {#?} \pod{#?} | pod with slots | `{□} \pod{□}` | Operators |
| / | Slash (/) | `/` | Operators |
| · | centerdot | `\centerdot` | Operators |
| ∧ | land | `\land` | Operators |
| ⊳ | rhd | `\rhd` | Operators |
| * | Asterisk (*) | `*` | Operators |
| ∘ | circ | `\circ` | Operators |
| ⋋ | leftthreetimes | `\leftthreetimes` | Operators |
| ⋌ | rightthreetimes | `\rightthreetimes` | Operators |
| ⨿ | amalg | `\amalg` | Operators |
| ⊛ | circledast | `\circledast` | Operators |
| .. | ldotp | `\ldotp` | Operators |
| ⋊ | rtimes | `\rtimes` | Operators |
| & | And | `\And` | Operators |
| ⊚ | circledcirc | `\circledcirc` | Operators |
| ∨ | lor | `\lor` | Operators |
| ∖ | setminus | `\setminus` | Operators |
| * | ast | `\ast` | Operators |
| ⊝ | circleddash | `\circleddash` | Operators |
| ⋖ | lessdot | `\lessdot` | Operators |
| ∖ | smallsetminus | `\smallsetminus` | Operators |
| ⊼ | barwedge | `\barwedge` | Operators |
| ⋓ | Cup | `\Cup` | Operators |
| ⊲ | lhd | `\lhd` | Operators |
| ⊓ | sqcap | `\sqcap` | Operators |
| ○ | bigcirc | `\bigcirc` | Operators |
| ∪ | cup | `\cup` | Operators |
| ⋉ | ltimes | `\ltimes` | Operators |
| ⊔ | sqcup | `\sqcup` | Operators |
| % | bmod | `\bmod` | Operators |
| ⋎ | curlyvee | `\curlyvee` | Operators |
| {#?}\mod {#?} | mod with slots | `{□}\mod {□}` | Operators |
| × | times | `\times` | Operators |
| ⊡ | boxdot | `\boxdot` | Operators |
| ⋏ | curlywedge | `\curlywedge` | Operators |
| ∓ | mp | `\mp` | Operators |
| ⊴ | unlhd | `\unlhd` | Operators |
| ⊟ | boxminus | `\boxminus` | Operators |
| ÷ | div | `\div` | Operators |
| ⊙ | odot | `\odot` | Operators |
| ⊵ | unrhd | `\unrhd` | Operators |
| ⊞ | boxplus | `\boxplus` | Operators |
| ⋇ | divideontimes | `\divideontimes` | Operators |
| ⊖ | ominus | `\ominus` | Operators |
| ⊎ | uplus | `\uplus` | Operators |
| ⊠ | boxtimes | `\boxtimes` | Operators |
| ∔ | dotplus | `\dotplus` | Operators |
| ⊕ | oplus | `\oplus` | Operators |
| ∨ | vee | `\vee` | Operators |
| • | bullet | `\bullet` | Operators |
| ⩞ | doublebarwedge | `\doublebarwedge` | Operators |
| ⊗ | otimes | `\otimes` | Operators |
| ⊻ | veebar | `\veebar` | Operators |
| ⋒ | Cap | `\Cap` | Operators |
| ⋒ | doublecap | `\doublecap` | Operators |
| ⊘ | oslash | `\oslash` | Operators |
| ∧ | wedge | `\wedge` | Operators |
| ∩ | cap | `\cap` | Operators |
| ⋓ | doublecup | `\doublecup` | Operators |
| ± | pm | `\pm` | Operators |
| ± | plusmn | `\plusmn` | Operators |
| ≀ | wr | `\wr` | Operators |
| □/□ | frac | `\frac{□}{□}` | Fractions |
| □/□ | tfrac | `\tfrac{□}{□}` | Fractions |
| □/□ | dfrac | `\dfrac{□}{□}` | Fractions |
| (□ over □) | binom | `\binom{□}{□}` | Fractions |
| = | Equals | `=` | Relations |
| ≠ | Not equal | `\ne` | Relations |
| ≤ | Less or equal | `\le` | Relations |
| ≥ | Greater or equal | `\ge` | Relations |
| ≈ | Approximately | `\approx` | Relations |
| ∝ | Proportional to | `\propto` | Relations |
| < | < | `<` | Relations |
| > | > | `>` | Relations |
| : | : | `:` | Relations |
| ≤ | leq | `\leq` | Relations |
| ≥ | geq | `\geq` | Relations |
| ≠ | neq | `\neq` | Relations |
| < | lt | `\lt` | Relations |
| > | gt | `\gt` | Relations |
| ≑ | doteqdot | `\doteqdot` | Relations |
| ≖ | eqcirc | `\eqcirc` | Relations |
| ≕ | eqcolon | `\eqcolon` | Relations |
| ∹ | minuscolon | `\minuscolon` | Relations |
| ≕ | Eqcolon | `\Eqcolon` | Relations |
| ∺ | minuscoloncolon | `\minuscoloncolon` | Relations |
| ≕ | eqqcolon | `\eqqcolon` | Relations |
| ≕ | equalscolon | `\equalscolon` | Relations |
| ⩴ | Eqqcolon | `\Eqqcolon` | Relations |
| ⩴ | equalscoloncolon | `\equalscoloncolon` | Relations |
| ≈: | approxcolon | `\approxcolon` | Relations |
| ≈:: | approxcoloncolon | `\approxcoloncolon` | Relations |
| ≊ | approxeq | `\approxeq` | Relations |
| ≍ | asymp | `\asymp` | Relations |
| ∍ | backepsilon | `\backepsilon` | Relations |
| ∽ | backsim | `\backsim` | Relations |
| ⋍ | backsimeq | `\backsimeq` | Relations |
| ≬ | between | `\between` | Relations |
| ⋈ | bowtie | `\bowtie` | Relations |
| ≏ | bumpeq | `\bumpeq` | Relations |
| ≎ | Bumpeq | `\Bumpeq` | Relations |
| ≗ | circeq | `\circeq` | Relations |
| :≈ | colonapprox | `\colonapprox` | Relations |
| ::≈ | Colonapprox | `\Colonapprox` | Relations |
| ::≈ | coloncolonapprox | `\coloncolonapprox` | Relations |
| := | coloneq | `\coloneq` | Relations |
| :- | colonminus | `\colonminus` | Relations |
| ::= | Coloneq | `\Coloneq` | Relations |
| ::- | coloncolonminus | `\coloncolonminus` | Relations |
| := | coloneqq | `\coloneqq` | Relations |
| := | colonequals | `\colonequals` | Relations |
| ::= | Coloneqq | `\Coloneqq` | Relations |
| ::= | coloncolonequals | `\coloncolonequals` | Relations |
| :∼ | colonsim | `\colonsim` | Relations |
| ::∼ | Colonsim | `\Colonsim` | Relations |
| ::∼ | coloncolonsim | `\coloncolonsim` | Relations |
| ≅ | cong | `\cong` | Relations |
| ⋞ | curlyeqprec | `\curlyeqprec` | Relations |
| ⋟ | curlyeqsucc | `\curlyeqsucc` | Relations |
| ⊣ | dashv | `\dashv` | Relations |
| ∷ | dblcolon | `\dblcolon` | Relations |
| ∷ | coloncolon | `\coloncolon` | Relations |
| ≐ | doteq | `\doteq` | Relations |
| ≑ | Doteq | `\Doteq` | Relations |
| ≂ | eqsim | `\eqsim` | Relations |
| ⪖ | eqslantgtr | `\eqslantgtr` | Relations |
| ⪕ | eqslantless | `\eqslantless` | Relations |
| ≡ | equiv | `\equiv` | Relations |
| ≒ | fallingdotseq | `\fallingdotseq` | Relations |
| ⌢ | frown | `\frown` | Relations |
| ≧ | geqq | `\geqq` | Relations |
| ⩾ | geqslant | `\geqslant` | Relations |
| ≫ | gg | `\gg` | Relations |
| ⋙ | ggg | `\ggg` | Relations |
| ⋙ | gggtr | `\gggtr` | Relations |
| ⪆ | gtrapprox | `\gtrapprox` | Relations |
| ⋛ | gtreqless | `\gtreqless` | Relations |
| ⪌ | gtreqqless | `\gtreqqless` | Relations |
| ≷ | gtrless | `\gtrless` | Relations |
| ≳ | gtrsim | `\gtrsim` | Relations |
| ⊷ | imageof | `\imageof` | Relations |
| ⋈ | Join | `\Join` | Relations |
| ≦ | leqq | `\leqq` | Relations |
| ⩽ | leqslant | `\leqslant` | Relations |
| ⪅ | lessapprox | `\lessapprox` | Relations |
| ⋚ | lesseqgtr | `\lesseqgtr` | Relations |
| ⪋ | lesseqqgtr | `\lesseqqgtr` | Relations |
| ≶ | lessgtr | `\lessgtr` | Relations |
| ≲ | lesssim | `\lesssim` | Relations |
| ≪ | ll | `\ll` | Relations |
| ⋘ | lll | `\lll` | Relations |
| ⋘ | llless | `\llless` | Relations |
| ⊨ | models | `\models` | Relations |
| ⊸ | multimap | `\multimap` | Relations |
| ⊶ | origof | `\origof` | Relations |
| ∋ | owns | `\owns` | Relations |
| ∥ | parallel | `\parallel` | Relations |
| ⊥ | perp | `\perp` | Relations |
| ⋔ | pitchfork | `\pitchfork` | Relations |
| ≺ | prec | `\prec` | Relations |
| ⪷ | precapprox | `\precapprox` | Relations |
| ≼ | preccurlyeq | `\preccurlyeq` | Relations |
| ⪯ | preceq | `\preceq` | Relations |
| ≾ | precsim | `\precsim` | Relations |
| ≓ | risingdotseq | `\risingdotseq` | Relations |
| ∣ | shortmid | `\shortmid` | Relations |
| ∥ | shortparallel | `\shortparallel` | Relations |
| ∼ | sim | `\sim` | Relations |
| ≃ | simeq | `\simeq` | Relations |
| ⌢ | smallfrown | `\smallfrown` | Relations |
| ⌣ | smallsmile | `\smallsmile` | Relations |
| ⌣ | smile | `\smile` | Relations |
| ⊏ | sqsubset | `\sqsubset` | Relations |
| ⊑ | sqsubseteq | `\sqsubseteq` | Relations |
| ⊐ | sqsupset | `\sqsupset` | Relations |
| ⊒ | sqsupseteq | `\sqsupseteq` | Relations |
| ⊂ | sub | `\sub` | Relations |
| ⊆ | sube | `\sube` | Relations |
| ⋐ | Subset | `\Subset` | Relations |
| ⫅ | subseteqq | `\subseteqq` | Relations |
| ≻ | succ | `\succ` | Relations |
| ⪸ | succapprox | `\succapprox` | Relations |
| ≽ | succcurlyeq | `\succcurlyeq` | Relations |
| ⪰ | succeq | `\succeq` | Relations |
| ≿ | succsim | `\succsim` | Relations |
| ⊇ | supe | `\supe` | Relations |
| ⋑ | Supset | `\Supset` | Relations |
| ⫆ | supseteqq | `\supseteqq` | Relations |
| ≈ | thickapprox | `\thickapprox` | Relations |
| ∼ | thicksim | `\thicksim` | Relations |
| ⊴ | trianglelefteq | `\trianglelefteq` | Relations |
| ≜ | triangleq | `\triangleq` | Relations |
| ⊵ | trianglerighteq | `\trianglerighteq` | Relations |
| ∝ | varpropto | `\varpropto` | Relations |
| △ | vartriangle | `\vartriangle` | Relations |
| ⊲ | vartriangleleft | `\vartriangleleft` | Relations |
| ⊳ | vartriangleright | `\vartriangleright` | Relations |
| : | vcentcolon | `\vcentcolon` | Relations |
| : | ratio | `\ratio` | Relations |
| ⊢ | vdash | `\vdash` | Relations |
| ⊨ | vDash | `\vDash` | Relations |
| ⊩ | Vdash | `\Vdash` | Relations |
| ⊪ | Vvdash | `\Vvdash` | Relations |
| ≠ | not | `\not` | Relations |
| ⪊ | gnapprox | `\gnapprox` | Relations |
| ≩ | gneq | `\gneq` | Relations |
| ≩ | gneqq | `\gneqq` | Relations |
| ⋧ | gnsim | `\gnsim` | Relations |
| ≩ | gvertneqq | `\gvertneqq` | Relations |
| ⪉ | lnapprox | `\lnapprox` | Relations |
| ≨ | lneq | `\lneq` | Relations |
| ≨ | lneqq | `\lneqq` | Relations |
| ⋦ | lnsim | `\lnsim` | Relations |
| ≨ | lvertneqq | `\lvertneqq` | Relations |
| ≇ | ncong | `\ncong` | Relations |
| ≠ | ne | `\ne` | Relations |
| ≠ | neq | `\neq` | Relations |
| ≱ | ngeq | `\ngeq` | Relations |
| ≱ | ngeqq | `\ngeqq` | Relations |
| ≱ | ngeqslant | `\ngeqslant` | Relations |
| ≯ | ngtr | `\ngtr` | Relations |
| ≰ | nleq | `\nleq` | Relations |
| ≰ | nleqq | `\nleqq` | Relations |
| ≰ | nleqslant | `\nleqslant` | Relations |
| ≮ | nless | `\nless` | Relations |
| ∤ | nmid | `\nmid` | Relations |
| ∉ | notin | `\notin` | Relations |
| ∌ | notni | `\notni` | Relations |
| ∦ | nparallel | `\nparallel` | Relations |
| ⊀ | nprec | `\nprec` | Relations |
| ⋠ | npreceq | `\npreceq` | Relations |
| ∤ | nshortmid | `\nshortmid` | Relations |
| ∦ | nshortparallel | `\nshortparallel` | Relations |
| ≁ | nsim | `\nsim` | Relations |
| ⊈ | nsubseteq | `\nsubseteq` | Relations |
| ⊈ | nsubseteqq | `\nsubseteqq` | Relations |
| ⊁ | nsucc | `\nsucc` | Relations |
| ⋡ | nsucceq | `\nsucceq` | Relations |
| ⊉ | nsupseteq | `\nsupseteq` | Relations |
| ⊉ | nsupseteqq | `\nsupseteqq` | Relations |
| ⋪ | ntriangleleft | `\ntriangleleft` | Relations |
| ⋬ | ntrianglelefteq | `\ntrianglelefteq` | Relations |
| ⋫ | ntriangleright | `\ntriangleright` | Relations |
| ⋭ | ntrianglerighteq | `\ntrianglerighteq` | Relations |
| ⊬ | nvdash | `\nvdash` | Relations |
| ⊭ | nvDash | `\nvDash` | Relations |
| ⊯ | nVDash | `\nVDash` | Relations |
| ⊮ | nVdash | `\nVdash` | Relations |
| ⪹ | precnapprox | `\precnapprox` | Relations |
| ⪵ | precneqq | `\precneqq` | Relations |
| ⋨ | precnsim | `\precnsim` | Relations |
| ⊊ | subsetneq | `\subsetneq` | Relations |
| ⫋ | subsetneqq | `\subsetneqq` | Relations |
| ⪺ | succnapprox | `\succnapprox` | Relations |
| ⪶ | succneqq | `\succneqq` | Relations |
| ⋩ | succnsim | `\succnsim` | Relations |
| ⊋ | supsetneq | `\supsetneq` | Relations |
| ⫌ | supsetneqq | `\supsetneqq` | Relations |
| ⊊ | varsubsetneq | `\varsubsetneq` | Relations |
| ⫋ | varsubsetneqq | `\varsubsetneqq` | Relations |
| ⊋ | varsupsetneq | `\varsupsetneq` | Relations |
| ⫌ | varsupsetneqq | `\varsupsetneqq` | Relations |
| ∈ | Element of | `\in` | Sets and Logic |
| ∉ | Not element of | `\notin` | Sets and Logic |
| ∅ | Empty set | `\emptyset` | Sets and Logic |
| ⊂ | Subset | `\subset` | Sets and Logic |
| ⊆ | Subset or equal | `\subseteq` | Sets and Logic |
| ⊃ | Superset | `\supset` | Sets and Logic |
| ∪ | Union | `\cup` | Sets and Logic |
| ∩ | Intersection | `\cap` | Sets and Logic |
| ∀ | For all | `\forall` | Sets and Logic |
| ∃ | There exists | `\exists` | Sets and Logic |
| ¬ | Logical not | `\neg` | Sets and Logic |
| ∧ | Logical and | `\wedge` | Sets and Logic |
| ∨ | Logical or | `\vee` | Sets and Logic |
| → | Right arrow | `\rightarrow` | Arrows |
| ← | Left arrow | `\leftarrow` | Arrows |
| ↔ | Both arrows | `\leftrightarrow` | Arrows |
| ↑ | Up arrow | `\uparrow` | Arrows |
| ↓ | Down arrow | `\downarrow` | Arrows |
| ↕ | Up-down arrow | `\updownarrow` | Arrows |
| ⇒ | Implies | `\Rightarrow` | Arrows |
| ⇐ | Implied by | `\Leftarrow` | Arrows |
| ⇔ | If and only if | `\Leftrightarrow` | Arrows |
| ⇑ | Double up arrow | `\Uparrow` | Arrows |
| ⇓ | Double down arrow | `\Downarrow` | Arrows |
| ⇕ | Double up-down arrow | `\Updownarrow` | Arrows |
| ↦ | Maps to | `\mapsto` | Arrows |
| ↺ | circlearrowleft | `\circlearrowleft` | Arrows |
| ↻ | circlearrowright | `\circlearrowright` | Arrows |
| ↶ | curvearrowleft | `\curvearrowleft` | Arrows |
| ↷ | curvearrowright | `\curvearrowright` | Arrows |
| ⇠ | dashleftarrow | `\dashleftarrow` | Arrows |
| ⇢ | dashrightarrow | `\dashrightarrow` | Arrows |
| ⇊ | downdownarrows | `\downdownarrows` | Arrows |
| ⇃ | downharpoonleft | `\downharpoonleft` | Arrows |
| ⇂ | downharpoonright | `\downharpoonright` | Arrows |
| ← | gets | `\gets` | Arrows |
| ↩ | hookleftarrow | `\hookleftarrow` | Arrows |
| ↪ | hookrightarrow | `\hookrightarrow` | Arrows |
| ⇔ | iff | `\iff` | Arrows |
| ⇐ | impliedby | `\impliedby` | Arrows |
| ⇒ | implies | `\implies` | Arrows |
| ⇝ | leadsto | `\leadsto` | Arrows |
| ⇐ | Leftarrow | `\Leftarrow` | Arrows |
| ↢ | leftarrowtail | `\leftarrowtail` | Arrows |
| ↽ | leftharpoondown | `\leftharpoondown` | Arrows |
| ↼ | leftharpoonup | `\leftharpoonup` | Arrows |
| ⇇ | leftleftarrows | `\leftleftarrows` | Arrows |
| ⇆ | leftrightarrows | `\leftrightarrows` | Arrows |
| ⇋ | leftrightharpoons | `\leftrightharpoons` | Arrows |
| ↭ | leftrightsquigarrow | `\leftrightsquigarrow` | Arrows |
| ⇚ | Lleftarrow | `\Lleftarrow` | Arrows |
| ⟵ | longleftarrow | `\longleftarrow` | Arrows |
| ⟸ | Longleftarrow | `\Longleftarrow` | Arrows |
| ⟷ | longleftrightarrow | `\longleftrightarrow` | Arrows |
| ⟺ | Longleftrightarrow | `\Longleftrightarrow` | Arrows |
| ⟼ | longmapsto | `\longmapsto` | Arrows |
| ⟶ | longrightarrow | `\longrightarrow` | Arrows |
| ⟹ | Longrightarrow | `\Longrightarrow` | Arrows |
| ↫ | looparrowleft | `\looparrowleft` | Arrows |
| ↬ | looparrowright | `\looparrowright` | Arrows |
| ↰ | Lsh | `\Lsh` | Arrows |
| ↦ | mapsto | `\mapsto` | Arrows |
| ↗ | nearrow | `\nearrow` | Arrows |
| ↚ | nleftarrow | `\nleftarrow` | Arrows |
| ⇍ | nLeftarrow | `\nLeftarrow` | Arrows |
| ↮ | nleftrightarrow | `\nleftrightarrow` | Arrows |
| ⇎ | nLeftrightarrow | `\nLeftrightarrow` | Arrows |
| ↛ | nrightarrow | `\nrightarrow` | Arrows |
| ⇏ | nRightarrow | `\nRightarrow` | Arrows |
| ↖ | nwarrow | `\nwarrow` | Arrows |
| ↾ | restriction | `\restriction` | Arrows |
| ↣ | rightarrowtail | `\rightarrowtail` | Arrows |
| ⇁ | rightharpoondown | `\rightharpoondown` | Arrows |
| ⇀ | rightharpoonup | `\rightharpoonup` | Arrows |
| ⇄ | rightleftarrows | `\rightleftarrows` | Arrows |
| ⇌ | rightleftharpoons | `\rightleftharpoons` | Arrows |
| ⇉ | rightrightarrows | `\rightrightarrows` | Arrows |
| ⇝ | rightsquigarrow | `\rightsquigarrow` | Arrows |
| ⇛ | Rrightarrow | `\Rrightarrow` | Arrows |
| ↱ | Rsh | `\Rsh` | Arrows |
| ↘ | searrow | `\searrow` | Arrows |
| ↙ | swarrow | `\swarrow` | Arrows |
| → | to | `\to` | Arrows |
| ↞ | twoheadleftarrow | `\twoheadleftarrow` | Arrows |
| ↠ | twoheadrightarrow | `\twoheadrightarrow` | Arrows |
| ↿ | upharpoonleft | `\upharpoonleft` | Arrows |
| ↾ | upharpoonright | `\upharpoonright` | Arrows |
| ⇈ | upuparrows | `\upuparrows` | Arrows |
| ⟨□⟩ | leftlangle{#?}rightrangle | `\left\langle{□}\right\rangle` | Notation |
| \|□⟩ | leftlvert{#?}rightrangle | `\left\lvert{□}\right\rangle` | Notation |
| ⟨□\| | leftlangle{#?}rightrvert | `\left\langle{□}\right\rvert` | Notation |
| {□} | leftlbrace{#?}rightrbrace | `\left\lbrace{□}\right\rbrace` | Notation |
| ∁ | complement | `\complement` | Notation |
| ∴ | therefore | `\therefore` | Notation |
| ∵ | because | `\because` | Notation |
| ∅ | emptyset | `\emptyset` | Notation |
| ∅ | varnothing | `\varnothing` | Notation |
| ∃ | exists | `\exists` | Notation |
| ∄ | nexists | `\nexists` | Notation |
| \| | mid | `\mid` | Notation |
| ∈ | in | `\in` | Notation |
| ∋ | ni | `\ni` | Notation |
| ¬ | lnot | `\lnot` | Notation |
| ↵ | Newline | `\\` | Layout |
| ↵ | Newline | `\newline` | Layout |
| thin | Thin space | `\,` | Layout |
| thin | Thin space | `\thinspace` | Layout |
| med | Medium space | `\:` | Layout |
| med | Medium space | `\medspace` | Layout |
| thick | Thick space | `\;` | Layout |
| thick | Thick space | `\thickspace` | Layout |
| en | En space | `\enspace` | Layout |
| quad | Quad space | `\quad` | Layout |
| qquad | Double quad space | `\qquad` | Layout |
| tight | Negative thin space | `\!` | Layout |
| tight | Negative thin space | `\negthinspace` | Layout |
| ~ | Non-breaking space (~) | `~` | Layout |
| boxed □ | boxed | `\boxed{□}` | Layout |
| □ over □ | stackrel | `\stackrel{□}{□}` | Layout |
| phantom □ | phantom | `\phantom{□}` | Layout |
| horizontal phantom □ | hphantom | `\hphantom{□}` | Layout |
| vertical phantom □ | vphantom | `\vphantom{□}` | Layout |
| horizontal space □ | hspace | `\hspace{□}` | Layout |
| horizontal space* □ | hspace* | `\hspace*{□}` | Layout |
| arcsin | arcsin | `\arcsin` | Functions |
| arccos | arccos | `\arccos` | Functions |
| arctan | arctan | `\arctan` | Functions |
| arctg | arctg | `\arctg` | Functions |
| arcctg | arcctg | `\arcctg` | Functions |
| arg | arg | `\arg` | Functions |
| ch | ch | `\ch` | Functions |
| cos | cos | `\cos` | Functions |
| cosec | cosec | `\cosec` | Functions |
| cosh | cosh | `\cosh` | Functions |
| cot | cot | `\cot` | Functions |
| cotg | cotg | `\cotg` | Functions |
| coth | coth | `\coth` | Functions |
| csc | csc | `\csc` | Functions |
| ctg | ctg | `\ctg` | Functions |
| cth | cth | `\cth` | Functions |
| deg | deg | `\deg` | Functions |
| dim | dim | `\dim` | Functions |
| exp | exp | `\exp` | Functions |
| hom | hom | `\hom` | Functions |
| ker | ker | `\ker` | Functions |
| lg | lg | `\lg` | Functions |
| ln | ln | `\ln` | Functions |
| log | log | `\log` | Functions |
| sec | sec | `\sec` | Functions |
| sin | sin | `\sin` | Functions |
| sinh | sinh | `\sinh` | Functions |
| sh | sh | `\sh` | Functions |
| tan | tan | `\tan` | Functions |
| tanh | tanh | `\tanh` | Functions |
| tg | tg | `\tg` | Functions |
| th | th | `\th` | Functions |
| f | f | `\operatorname{f}` | Functions |
| argmax | argmax | `\argmax` | Functions |
| argmin | argmin | `\argmin` | Functions |
| det | det | `\det` | Functions |
| gcd | gcd | `\gcd` | Functions |
| inf | inf | `\inf` | Functions |
| injlim | injlim | `\injlim` | Functions |
| lim | lim | `\lim` | Functions |
| liminf | liminf | `\liminf` | Functions |
| limsup | limsup | `\limsup` | Functions |
| max | max | `\max` | Functions |
| min | min | `\min` | Functions |
| plim | plim | `\plim` | Functions |
| Pr | Pr | `\Pr` | Functions |
| projlim | projlim | `\projlim` | Functions |
| sup | sup | `\sup` | Functions |
| varinjlim | varinjlim | `\varinjlim` | Functions |
| varliminf | varliminf | `\varliminf` | Functions |
| varlimsup | varlimsup | `\varlimsup` | Functions |
| varprojlim | varprojlim | `\varprojlim` | Functions |
| f* | f | `\operatorname*{f}` | Functions |
| f limits | f | `\operatornamewithlimits{f}` | Functions |
