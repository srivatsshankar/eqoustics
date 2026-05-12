import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSquare as faSquareRegular } from '@fortawesome/free-regular-svg-icons'
import {
  faBold,
  faChevronDown,
  faFile,
  faFloppyDisk,
  faFolderOpen,
  faHeading,
  faItalic,
  faListOl,
  faListUl,
  faArrowRotateLeft,
  faArrowRotateRight,
  faSquareRootVariable,
  faUnderline,
  faFileExport,
  faFilePdf,
  faFileCode,
  faCopy,
  faScissors,
  faPaste,
} from '@fortawesome/free-solid-svg-icons'
import { CustomScrollbar } from '../scrollbar/CustomScrollbar'
import { MatrixDropdown } from './MatrixDropdown'
import type { TextFormatCommand } from '../cell/CellEditor'
import { KATEX_COMMAND_PREVIEWS, KATEX_TEMPLATE_PREVIEWS } from '../../shared/katexPreviews'

interface EditorToolbarProps {
  hasActiveCell: boolean
  canSave: boolean
  onInsertSnippet: (snippet: string, mode?: 'cmd' | 'write' | 'latex' | 'template' | 'func-slot') => void
  onFormatText: (format: TextFormatCommand) => void
  onNewNotebook: () => void
  onOpenNotebook: () => void
  onExportPdf: () => void
  onExportLatex: () => void
  onSaveNotebook: () => void
  onSaveNotebookAs: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

interface SymbolItem {
  display: string
  /** The LaTeX string to insert */
  value: string
  title: string
  /**
   * 'cmd'  → structural command (e.g. \frac creates a fraction with empty slots).
   * 'write' → literal LaTeX symbols, operators, etc.
   */
  mode: 'cmd' | 'write' | 'template'
}

interface SymbolGroup {
  label: string
  items: SymbolItem[]
}

function commandDisplay(value: string): string {
  if (KATEX_COMMAND_PREVIEWS[value]) return KATEX_COMMAND_PREVIEWS[value]
  if (value.startsWith('\\')) return value.slice(1)
  return value
}

function commandTitle(value: string, label = commandDisplay(value)): string {
  return `${label} (${value})`
}

function commandItems(values: string[]): SymbolItem[] {
  return values.map((value) => ({
    display: commandDisplay(value),
    value,
    title: commandTitle(value),
    mode: value.startsWith('\\') ? 'cmd' : 'write',
  }))
}

function templateItem(display: string, value: string, title = commandTitle(value, display)): SymbolItem {
  return { display: KATEX_TEMPLATE_PREVIEWS[value] ?? display, value, title, mode: 'template' }
}

function templateItems(items: Array<[string, string, string?]>): SymbolItem[] {
  return items.map(([display, value, title]) => templateItem(display, value, title))
}

const GREEK_ALIAS_VALUES = [
  '\\Alpha', '\\Beta', '\\Epsilon', '\\Zeta', '\\Eta', '\\Iota', '\\Kappa', '\\Mu', '\\Nu',
  '\\Omicron', '\\Rho', '\\Tau', '\\Chi', '\\omicron', '\\thetasym', '\\varGamma', '\\varDelta',
  '\\varTheta', '\\varLambda', '\\varXi', '\\varPi', '\\varSigma', '\\varUpsilon', '\\varPhi',
  '\\varPsi', '\\varOmega',
]

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    label: 'Structures',
    items: [
      { display: '∫', value: '\\int', title: 'Integral', mode: 'cmd' },
      { display: '∑', value: '\\sum', title: 'Summation', mode: 'cmd' },
      { display: '∏', value: '\\prod', title: 'Product', mode: 'cmd' },
    ],
  },

  {
    label: 'Relations',
    items: [
      { display: '=', value: '=', title: 'Equals', mode: 'write' },
      { display: '≠', value: '\\ne', title: 'Not equal', mode: 'cmd' },
      { display: '≤', value: '\\le', title: 'Less or equal', mode: 'cmd' },
      { display: '≥', value: '\\ge', title: 'Greater or equal', mode: 'cmd' },
      { display: '≈', value: '\\approx', title: 'Approximately', mode: 'cmd' },
      { display: '∝', value: '\\propto', title: 'Proportional to', mode: 'cmd' },
    ],
  },
  {
    label: 'Arithmetic',
    items: [
      { display: '+', value: '+', title: 'Plus', mode: 'write' },
      { display: '-', value: '-', title: 'Minus', mode: 'write' },
      { display: '×', value: '\\times', title: 'Multiplication (cross)', mode: 'cmd' },
      { display: '·', value: '\\cdot', title: 'Multiplication (dot)', mode: 'cmd' },
      { display: '÷', value: '\\div', title: 'Division', mode: 'cmd' },
    ],
  },
  {
    label: 'Greek',
    items: [
      { display: 'α', value: '\\alpha', title: 'Alpha (\\alpha)', mode: 'cmd' },
      { display: 'β', value: '\\beta', title: 'Beta (\\beta)', mode: 'cmd' },
      { display: 'γ', value: '\\gamma', title: 'Gamma (\\gamma)', mode: 'cmd' },
      { display: 'δ', value: '\\delta', title: 'Delta (\\delta)', mode: 'cmd' },
      { display: 'ε', value: '\\epsilon', title: 'Epsilon (\\epsilon)', mode: 'cmd' },
      { display: 'ϵ', value: '\\varepsilon', title: 'Variant epsilon (\\varepsilon)', mode: 'cmd' },
      { display: 'ζ', value: '\\zeta', title: 'Zeta (\\zeta)', mode: 'cmd' },
      { display: 'η', value: '\\eta', title: 'Eta (\\eta)', mode: 'cmd' },
      { display: 'θ', value: '\\theta', title: 'Theta (\\theta)', mode: 'cmd' },
      { display: 'ϑ', value: '\\vartheta', title: 'Variant theta (\\vartheta)', mode: 'cmd' },
      { display: 'ι', value: '\\iota', title: 'Iota (\\iota)', mode: 'cmd' },
      { display: 'κ', value: '\\kappa', title: 'Kappa (\\kappa)', mode: 'cmd' },
      { display: 'ϰ', value: '\\varkappa', title: 'Variant kappa (\\varkappa)', mode: 'cmd' },
      { display: 'λ', value: '\\lambda', title: 'Lambda (\\lambda)', mode: 'cmd' },
      { display: 'μ', value: '\\mu', title: 'Mu (\\mu)', mode: 'cmd' },
      { display: 'ν', value: '\\nu', title: 'Nu (\\nu)', mode: 'cmd' },
      { display: 'o', value: 'o', title: 'Omicron', mode: 'write' },
      { display: 'ξ', value: '\\xi', title: 'Xi (\\xi)', mode: 'cmd' },
      { display: 'π', value: '\\pi', title: 'Pi (\\pi)', mode: 'cmd' },
      { display: 'ϖ', value: '\\varpi', title: 'Variant pi (\\varpi)', mode: 'cmd' },
      { display: 'ρ', value: '\\rho', title: 'Rho (\\rho)', mode: 'cmd' },
      { display: 'ϱ', value: '\\varrho', title: 'Variant rho (\\varrho)', mode: 'cmd' },
      { display: 'σ', value: '\\sigma', title: 'Sigma (\\sigma)', mode: 'cmd' },
      { display: 'ς', value: '\\varsigma', title: 'Final sigma (\\varsigma)', mode: 'cmd' },
      { display: 'τ', value: '\\tau', title: 'Tau (\\tau)', mode: 'cmd' },
      { display: 'υ', value: '\\upsilon', title: 'Upsilon (\\upsilon)', mode: 'cmd' },
      { display: 'φ', value: '\\phi', title: 'Phi (\\phi)', mode: 'cmd' },
      { display: 'ϕ', value: '\\varphi', title: 'Variant phi (\\varphi)', mode: 'cmd' },
      { display: 'χ', value: '\\chi', title: 'Chi (\\chi)', mode: 'cmd' },
      { display: 'ψ', value: '\\psi', title: 'Psi (\\psi)', mode: 'cmd' },
      { display: 'ω', value: '\\omega', title: 'Omega (\\omega)', mode: 'cmd' },
      { display: 'ϝ', value: '\\digamma', title: 'Digamma (\\digamma)', mode: 'cmd' },
      { display: 'Γ', value: '\\Gamma', title: 'Gamma (upper) (\\Gamma)', mode: 'cmd' },
      { display: 'Δ', value: '\\Delta', title: 'Delta (upper) (\\Delta)', mode: 'cmd' },
      { display: 'Θ', value: '\\Theta', title: 'Theta (upper) (\\Theta)', mode: 'cmd' },
      { display: 'Λ', value: '\\Lambda', title: 'Lambda (upper) (\\Lambda)', mode: 'cmd' },
      { display: 'Ξ', value: '\\Xi', title: 'Xi (upper) (\\Xi)', mode: 'cmd' },
      { display: 'Π', value: '\\Pi', title: 'Pi (upper) (\\Pi)', mode: 'cmd' },
      { display: 'Σ', value: '\\Sigma', title: 'Sigma (upper) (\\Sigma)', mode: 'cmd' },
      { display: 'Υ', value: '\\Upsilon', title: 'Upsilon (upper) (\\Upsilon)', mode: 'cmd' },
      { display: 'Φ', value: '\\Phi', title: 'Phi (upper) (\\Phi)', mode: 'cmd' },
      { display: 'Ψ', value: '\\Psi', title: 'Psi (upper) (\\Psi)', mode: 'cmd' },
      { display: 'Ω', value: '\\Omega', title: 'Omega (upper) (\\Omega)', mode: 'cmd' },
      { display: 'ℵ', value: '\\aleph', title: 'Aleph (\\aleph)', mode: 'cmd' },
      { display: 'ℶ', value: '\\beth', title: 'Beth (\\beth)', mode: 'cmd' },
      { display: 'ℷ', value: '\\gimel', title: 'Gimel (\\gimel)', mode: 'cmd' },
      { display: 'ℸ', value: '\\daleth', title: 'Daleth (\\daleth)', mode: 'cmd' },
      { display: 'ı', value: '\\imath', title: 'Dotless i (\\imath)', mode: 'cmd' },
      { display: 'ȷ', value: '\\jmath', title: 'Dotless j (\\jmath)', mode: 'cmd' },
      { display: '∇', value: '\\nabla', title: 'Nabla (\\nabla)', mode: 'cmd' },
      { display: '∂', value: '\\partial', title: 'Partial derivative (\\partial)', mode: 'cmd' },
      { display: 'ℑ', value: '\\Im', title: 'Imaginary part (\\Im)', mode: 'cmd' },
      { display: 'ℑ', value: '\\image', title: 'Imaginary part (\\image)', mode: 'cmd' },
      { display: 'ℜ', value: '\\Re', title: 'Real part (\\Re)', mode: 'cmd' },
      { display: 'ℜ', value: '\\real', title: 'Real part (\\real)', mode: 'cmd' },
      { display: 'ℝ', value: '\\Reals', title: 'Real numbers (\\Reals)', mode: 'cmd' },
      { display: 'ℝ', value: '\\R', title: 'Real numbers (\\R)', mode: 'cmd' },
      { display: 'ℝ', value: '\\reals', title: 'Real numbers (\\reals)', mode: 'cmd' },
      { display: 'ℕ', value: '\\N', title: 'Natural numbers (\\N)', mode: 'cmd' },
      { display: 'ℕ', value: '\\natnums', title: 'Natural numbers (\\natnums)', mode: 'cmd' },
      { display: 'ℤ', value: '\\Z', title: 'Integers (\\Z)', mode: 'cmd' },
      { display: 'ℂ', value: '\\cnums', title: 'Complex numbers (\\cnums)', mode: 'cmd' },
      { display: 'ℂ', value: '\\Complex', title: 'Complex numbers (\\Complex)', mode: 'cmd' },
      { display: '𝕜', value: '\\Bbbk', title: 'Blackboard bold k (\\Bbbk)', mode: 'cmd' },
      { display: 'ℓ', value: '\\ell', title: 'Script ell (\\ell)', mode: 'cmd' },
      { display: 'ℏ', value: '\\hbar', title: 'h-bar (\\hbar)', mode: 'cmd' },
      { display: 'ℏ', value: '\\hslash', title: 'h-slash (\\hslash)', mode: 'cmd' },
      { display: '℘', value: '\\wp', title: 'Weierstrass p (\\wp)', mode: 'cmd' },
      { display: '℘', value: '\\weierp', title: 'Weierstrass p (\\weierp)', mode: 'cmd' },
      { display: '⅁', value: '\\Game', title: 'Game (\\Game)', mode: 'cmd' },
      { display: 'Ⅎ', value: '\\Finv', title: 'Turned F (\\Finv)', mode: 'cmd' },
      { display: 'ð', value: '\\eth', title: 'Eth (\\eth)', mode: 'cmd' },
      { display: 'Œ', value: '\\OE', title: 'OE ligature (\\OE)', mode: 'cmd' },
      { display: 'ø', value: '\\o', title: 'o slash (\\o)', mode: 'cmd' },
      { display: 'Ø', value: '\\O', title: 'O slash (\\O)', mode: 'cmd' },
      { display: 'ß', value: '\\ss', title: 'Eszett (\\ss)', mode: 'cmd' },
      { display: 'å', value: '\\aa', title: 'a ring (\\aa)', mode: 'cmd' },
      { display: 'Å', value: '\\AA', title: 'A ring (\\AA)', mode: 'cmd' },
      { display: 'ı', value: '\\i', title: 'Dotless i (\\i)', mode: 'cmd' },
      { display: 'ȷ', value: '\\j', title: 'Dotless j (\\j)', mode: 'cmd' },
      { display: 'æ', value: '\\ae', title: 'ae ligature (\\ae)', mode: 'cmd' },
      { display: 'Æ', value: '\\AE', title: 'AE ligature (\\AE)', mode: 'cmd' },
      { display: 'œ', value: '\\oe', title: 'oe ligature (\\oe)', mode: 'cmd' },
      { display: 'ℵ', value: '\\alef', title: 'Aleph (\\alef)', mode: 'cmd' },
      { display: 'ℵ', value: '\\alefsym', title: 'Aleph (\\alefsym)', mode: 'cmd' },
      ...commandItems(GREEK_ALIAS_VALUES),
    ],
  },
  {
    label: 'Calculus',
    items: [
      { display: '∂', value: '\\partial', title: 'Partial derivative', mode: 'cmd' },
      { display: '∇', value: '\\nabla', title: 'Nabla / Del', mode: 'cmd' },
      { display: '∞', value: '\\infty', title: 'Infinity', mode: 'cmd' },
      { display: 'dy/dx', value: '\\frac{dy}{dx}', title: 'Derivative', mode: 'write' },
      { display: '∫ₐᵇ', value: '\\int_{ }^{ }', title: 'Definite integral — type the bounds', mode: 'write' },
    ],
  },
  {
    label: 'Sets & Logic',
    items: [
      { display: '∈', value: '\\in', title: 'Element of', mode: 'cmd' },
      { display: '∉', value: '\\notin', title: 'Not element of', mode: 'cmd' },
      { display: '∅', value: '\\emptyset', title: 'Empty set', mode: 'cmd' },
      { display: '⊂', value: '\\subset', title: 'Subset', mode: 'cmd' },
      { display: '⊆', value: '\\subseteq', title: 'Subset or equal', mode: 'cmd' },
      { display: '⊃', value: '\\supset', title: 'Superset', mode: 'cmd' },
      { display: '∪', value: '\\cup', title: 'Union', mode: 'cmd' },
      { display: '∩', value: '\\cap', title: 'Intersection', mode: 'cmd' },
      { display: '∀', value: '\\forall', title: 'For all', mode: 'cmd' },
      { display: '∃', value: '\\exists', title: 'There exists', mode: 'cmd' },
      { display: '¬', value: '\\neg', title: 'Logical not', mode: 'cmd' },
      { display: '∧', value: '\\wedge', title: 'Logical and', mode: 'cmd' },
      { display: '∨', value: '\\vee', title: 'Logical or', mode: 'cmd' },
    ],
  },
  {
    label: 'Arrows',
    items: [
      { display: '→', value: '\\rightarrow', title: 'Right arrow', mode: 'cmd' },
      { display: '←', value: '\\leftarrow', title: 'Left arrow', mode: 'cmd' },
      { display: '↔', value: '\\leftrightarrow', title: 'Both arrows', mode: 'cmd' },
      { display: '⇒', value: '\\Rightarrow', title: 'Implies', mode: 'cmd' },
      { display: '⇐', value: '\\Leftarrow', title: 'Implied by', mode: 'cmd' },
      { display: '⇔', value: '\\Leftrightarrow', title: 'If and only if', mode: 'cmd' },
      { display: '↦', value: '\\mapsto', title: 'Maps to', mode: 'cmd' },
    ],
  },
  {
    label: 'Functions',
    items: [
      { display: 'arcsin', value: '\\arcsin', title: 'arcsin (\\arcsin)', mode: 'cmd' },
      { display: 'arccos', value: '\\arccos', title: 'arccos (\\arccos)', mode: 'cmd' },
      { display: 'arctan', value: '\\arctan', title: 'arctan (\\arctan)', mode: 'cmd' },
      { display: 'arctg', value: '\\arctg', title: 'arctg (\\arctg)', mode: 'cmd' },
      { display: 'arcctg', value: '\\arcctg', title: 'arcctg (\\arcctg)', mode: 'cmd' },
      { display: 'arg', value: '\\arg', title: 'arg (\\arg)', mode: 'cmd' },
      { display: 'ch', value: '\\ch', title: 'ch (\\ch)', mode: 'cmd' },
      { display: 'cos', value: '\\cos', title: 'cos (\\cos)', mode: 'cmd' },
      { display: 'cosec', value: '\\cosec', title: 'cosec (\\cosec)', mode: 'cmd' },
      { display: 'cosh', value: '\\cosh', title: 'cosh (\\cosh)', mode: 'cmd' },
      { display: 'cot', value: '\\cot', title: 'cot (\\cot)', mode: 'cmd' },
      { display: 'cotg', value: '\\cotg', title: 'cotg (\\cotg)', mode: 'cmd' },
      { display: 'coth', value: '\\coth', title: 'coth (\\coth)', mode: 'cmd' },
      { display: 'csc', value: '\\csc', title: 'csc (\\csc)', mode: 'cmd' },
      { display: 'ctg', value: '\\ctg', title: 'ctg (\\ctg)', mode: 'cmd' },
      { display: 'cth', value: '\\cth', title: 'cth (\\cth)', mode: 'cmd' },
      { display: 'deg', value: '\\deg', title: 'deg (\\deg)', mode: 'cmd' },
      { display: 'dim', value: '\\dim', title: 'dim (\\dim)', mode: 'cmd' },
      { display: 'exp', value: '\\exp', title: 'exp (\\exp)', mode: 'cmd' },
      { display: 'hom', value: '\\hom', title: 'hom (\\hom)', mode: 'cmd' },
      { display: 'ker', value: '\\ker', title: 'ker (\\ker)', mode: 'cmd' },
      { display: 'lg', value: '\\lg', title: 'lg (\\lg)', mode: 'cmd' },
      { display: 'ln', value: '\\ln', title: 'ln (\\ln)', mode: 'cmd' },
      { display: 'log', value: '\\log', title: 'log (\\log)', mode: 'cmd' },
      { display: 'sec', value: '\\sec', title: 'sec (\\sec)', mode: 'cmd' },
      { display: 'sin', value: '\\sin', title: 'sin (\\sin)', mode: 'cmd' },
      { display: 'sinh', value: '\\sinh', title: 'sinh (\\sinh)', mode: 'cmd' },
      { display: 'sh', value: '\\sh', title: 'sh (\\sh)', mode: 'cmd' },
      { display: 'tan', value: '\\tan', title: 'tan (\\tan)', mode: 'cmd' },
      { display: 'tanh', value: '\\tanh', title: 'tanh (\\tanh)', mode: 'cmd' },
      { display: 'tg', value: '\\tg', title: 'tg (\\tg)', mode: 'cmd' },
      { display: 'th', value: '\\th', title: 'th (\\th)', mode: 'cmd' },
      { display: 'f', value: '\\operatorname{f}', title: 'f (\\operatorname{f})', mode: 'write' },
      { display: 'argmax', value: '\\argmax', title: 'argmax (\\argmax)', mode: 'cmd' },
      { display: 'argmin', value: '\\argmin', title: 'argmin (\\argmin)', mode: 'cmd' },
      { display: 'det', value: '\\det', title: 'det (\\det)', mode: 'cmd' },
      { display: 'gcd', value: '\\gcd', title: 'gcd (\\gcd)', mode: 'cmd' },
      { display: 'inf', value: '\\inf', title: 'inf (\\inf)', mode: 'cmd' },
      { display: 'injlim', value: '\\injlim', title: 'injlim (\\injlim)', mode: 'cmd' },
      { display: 'lim', value: '\\lim', title: 'lim (\\lim)', mode: 'cmd' },
      { display: 'liminf', value: '\\liminf', title: 'liminf (\\liminf)', mode: 'cmd' },
      { display: 'limsup', value: '\\limsup', title: 'limsup (\\limsup)', mode: 'cmd' },
      { display: 'max', value: '\\max', title: 'max (\\max)', mode: 'cmd' },
      { display: 'min', value: '\\min', title: 'min (\\min)', mode: 'cmd' },
      { display: 'plim', value: '\\plim', title: 'plim (\\plim)', mode: 'cmd' },
      { display: 'Pr', value: '\\Pr', title: 'Pr (\\Pr)', mode: 'cmd' },
      { display: 'projlim', value: '\\projlim', title: 'projlim (\\projlim)', mode: 'cmd' },
      { display: 'sup', value: '\\sup', title: 'sup (\\sup)', mode: 'cmd' },
      { display: 'varinjlim', value: '\\varinjlim', title: 'varinjlim (\\varinjlim)', mode: 'cmd' },
      { display: 'varliminf', value: '\\varliminf', title: 'varliminf (\\varliminf)', mode: 'cmd' },
      { display: 'varlimsup', value: '\\varlimsup', title: 'varlimsup (\\varlimsup)', mode: 'cmd' },
      { display: 'varprojlim', value: '\\varprojlim', title: 'varprojlim (\\varprojlim)', mode: 'cmd' },
      { display: 'f*', value: '\\operatorname*{f}', title: 'f (\\operatorname*{f})', mode: 'write' },
      { display: 'f limits', value: '\\operatornamewithlimits{f}', title: 'f (\\operatornamewithlimits{f})', mode: 'write' },
    ],
  },
  {
    label: 'Environments',
    items: templateItems([
      ['array', '\\begin{array}{#?}#?\\end{array}', 'Array environment'],
      ['cases', '\\begin{cases}#?\\end{cases}', 'Cases environment'],
      ['rcases', '\\begin{rcases}#?\\end{rcases}', 'Right cases environment'],
      ['smallmatrix', '\\begin{smallmatrix}#?\\end{smallmatrix}', 'Small matrix environment'],
      ['subarray', '\\begin{subarray}{#?}#?\\end{subarray}', 'Subarray environment'],
      ['equation', '\\begin{equation}#?\\end{equation}', 'Equation environment'],
      ['equation*', '\\begin{equation*}#?\\end{equation*}', 'Equation* environment'],
      ['split', '\\begin{split}#?\\end{split}', 'Split environment'],
      ['align', '\\begin{align}#?\\end{align}', 'Align environment'],
      ['align*', '\\begin{align*}#?\\end{align*}', 'Align* environment'],
      ['aligned', '\\begin{aligned}#?\\end{aligned}', 'Aligned environment'],
      ['alignat', '\\begin{alignat}{#?}#?\\end{alignat}', 'Alignat environment'],
      ['alignat*', '\\begin{alignat*}{#?}#?\\end{alignat*}', 'Alignat* environment'],
      ['alignedat', '\\begin{alignedat}{#?}#?\\end{alignedat}', 'Alignedat environment'],
      ['gather', '\\begin{gather}#?\\end{gather}', 'Gather environment'],
      ['gather*', '\\begin{gather*}#?\\end{gather*}', 'Gather* environment'],
      ['gathered', '\\begin{gathered}#?\\end{gathered}', 'Gathered environment'],
      ['CD', '\\begin{CD}#?\\end{CD}', 'Commutative diagram environment'],
      ['darray', '\\begin{darray}{#?}#?\\end{darray}', 'Display array environment'],
      ['dcases', '\\begin{dcases}#?\\end{dcases}', 'Display cases environment'],
      ['drcases', '\\begin{drcases}#?\\end{drcases}', 'Display right cases environment'],
      ['matrix*', '\\begin{matrix*}[#?]#?\\end{matrix*}', 'Aligned matrix* environment'],
      ['pmatrix*', '\\begin{pmatrix*}[#?]#?\\end{pmatrix*}', 'Aligned pmatrix* environment'],
      ['bmatrix*', '\\begin{bmatrix*}[#?]#?\\end{bmatrix*}', 'Aligned bmatrix* environment'],
      ['Bmatrix*', '\\begin{Bmatrix*}[#?]#?\\end{Bmatrix*}', 'Aligned Bmatrix* environment'],
      ['vmatrix*', '\\begin{vmatrix*}[#?]#?\\end{vmatrix*}', 'Aligned vmatrix* environment'],
      ['Vmatrix*', '\\begin{Vmatrix*}[#?]#?\\end{Vmatrix*}', 'Aligned Vmatrix* environment'],
    ]),
  },
  {
    label: 'Accents',
    items: templateItems([
      ['tilde', '\\tilde{#?}'],
      ['widetilde', '\\widetilde{#?}'],
      ['utilde', '\\utilde{#?}'],
      ['acute', '\\acute{#?}'],
      ['bar', '\\bar{#?}'],
      ['breve', '\\breve{#?}'],
      ['check', '\\check{#?}'],
      ['dot', '\\dot{#?}'],
      ['ddot', '\\ddot{#?}'],
      ['dddot', '\\dddot{#?}'],
      ['ddddot', '\\ddddot{#?}'],
      ['grave', '\\grave{#?}'],
      ['hat', '\\hat{#?}'],
      ['widehat', '\\widehat{#?}'],
      ['widecheck', '\\widecheck{#?}'],
      ['mathring', '\\mathring{#?}'],
      ['vec', '\\vec{#?}'],
      ['overline', '\\overline{#?}'],
      ['underline', '\\underline{#?}'],
      ['underbar', '\\underbar{#?}'],
      ['overbrace', '\\overbrace{#?}^{#?}'],
      ['underbrace', '\\underbrace{#?}_{#?}'],
      ['overbracket', '\\overbracket{#?}^{#?}'],
      ['underbracket', '\\underbracket{#?}_{#?}'],
      ['overgroup', '\\overgroup{#?}'],
      ['undergroup', '\\undergroup{#?}'],
      ['overleftarrow', '\\overleftarrow{#?}'],
      ['overrightarrow', '\\overrightarrow{#?}'],
      ['Overrightarrow', '\\Overrightarrow{#?}'],
      ['underleftarrow', '\\underleftarrow{#?}'],
      ['underrightarrow', '\\underrightarrow{#?}'],
      ['overleftrightarrow', '\\overleftrightarrow{#?}'],
      ['underleftrightarrow', '\\underleftrightarrow{#?}'],
      ['overleftharpoon', '\\overleftharpoon{#?}'],
      ['overrightharpoon', '\\overrightharpoon{#?}'],
      ['overlinesegment', '\\overlinesegment{#?}'],
      ['underlinesegment', '\\underlinesegment{#?}'],
      ["\\'", "\\'{#?}", "Text acute accent (\\')"],
      ['\\`', '\\`{#?}', 'Text grave accent (\\`)'],
      ['\\^', '\\^{#?}', 'Text circumflex accent (\\^)'],
      ['\\~', '\\~{#?}', 'Text tilde accent (\\~)'],
      ['\\=', '\\={#?}', 'Text macron accent (\\=)'],
      ['\\u', '\\u{#?}', 'Text breve accent (\\u)'],
      ['\\.', '\\.{#?}', 'Text dot accent (\\.)'],
      ['\\"', '\\"{#?}', 'Text umlaut accent (\\")'],
      ['\\r', '\\r{#?}', 'Text ring accent (\\r)'],
      ['\\H', '\\H{#?}', 'Text double acute accent (\\H)'],
      ['\\v', '\\v{#?}', 'Text caron accent (\\v)'],
    ]),
  },
  {
    label: 'Delimiters',
    items: [
      ...commandItems([
        '\\lparen', '\\rparen', '\\lbrack', '\\rbrack', '\\lbrace', '\\rbrace', '\\langle', '\\rangle',
        '\\lang', '\\rang', '\\lt', '\\gt', '\\vert', '\\Vert', '\\lvert', '\\rvert', '\\lVert', '\\rVert',
        '\\lceil', '\\rceil', '\\lfloor', '\\rfloor', '\\lmoustache', '\\rmoustache', '\\lgroup', '\\rgroup',
        '\\ulcorner', '\\urcorner', '\\llcorner', '\\lrcorner', '\\llbracket', '\\rrbracket', '\\lBrace',
        '\\rBrace', '\\backslash', '\\uparrow', '\\downarrow', '\\updownarrow', '\\Uparrow', '\\Downarrow',
        '\\Updownarrow', '\\left', '\\middle', '\\right', '\\big', '\\Big', '\\bigg', '\\Bigg', '\\bigl',
        '\\Bigl', '\\biggl', '\\Biggl', '\\bigm', '\\Bigm', '\\biggm', '\\Biggm', '\\bigr', '\\Bigr',
        '\\biggr', '\\Biggr',
      ]),
    ],
  },
  {
    label: 'Big Operators',
    items: commandItems([
      '\\sum', '\\prod', '\\coprod', '\\int', '\\intop', '\\smallint', '\\iint', '\\iiint', '\\oint',
      '\\oiint', '\\oiiint', '\\bigotimes', '\\bigoplus', '\\bigodot', '\\biguplus', '\\bigsqcup',
      '\\bigvee', '\\bigwedge', '\\bigcap', '\\bigcup',
    ]),
  },
  {
    label: 'More Operators',
    items: [
      ...commandItems([
        '*', '/', '\\pm', '\\plusmn', '\\mp', '\\cdotp', '\\centerdot', '\\circ', '\\circledast',
        '\\circledcirc', '\\circleddash', '\\Cup', '\\Cap', '\\doublecap', '\\doublecup', '\\curlyvee',
        '\\curlywedge', '\\divideontimes', '\\dotplus', '\\doublebarwedge', '\\gtrdot', '\\intercal',
        '\\leftthreetimes', '\\rightthreetimes', '\\ldotp', '\\rtimes', '\\ltimes', '\\setminus',
        '\\smallsetminus', '\\lessdot', '\\lhd', '\\rhd', '\\unlhd', '\\unrhd', '\\amalg', '\\And',
        '\\ast', '\\barwedge', '\\bigcirc', '\\boxdot', '\\boxminus', '\\boxplus', '\\boxtimes',
        '\\bullet', '\\bmod', '\\mod', '\\pmod', '\\pod', '\\land', '\\lor', '\\odot', '\\ominus',
        '\\oplus', '\\oslash', '\\otimes', '\\sqcap', '\\sqcup', '\\uplus', '\\veebar', '\\wr',
      ]),
    ],
  },
  {
    label: 'Fractions',
    items: [
      ...templateItems([
        ['tfrac', '\\tfrac{#?}{#?}'],
        ['dfrac', '\\dfrac{#?}{#?}'],
        ['cfrac', '\\cfrac{#?}{#?}'],
        ['binom', '\\binom{#?}{#?}'],
        ['dbinom', '\\dbinom{#?}{#?}'],
        ['tbinom', '\\tbinom{#?}{#?}'],
        ['genfrac', '\\genfrac{#?}{#?}{#?}{#?}{#?}{#?}'],
        ['over', '{#? \\over #?}'],
        ['above', '{#? \\above{#?} #?}'],
        ['choose', '{#? \\choose #?}'],
        ['brace', '{#? \\brace #?}'],
        ['brack', '{#? \\brack #?}'],
      ]),
    ],
  },
  {
    label: 'More Relations',
    items: commandItems([
      '<', '>', ':', '\\leq', '\\geq', '\\neq', '\\lt', '\\gt', '\\doteqdot', '\\eqcirc', '\\eqcolon',
      '\\minuscolon', '\\Eqcolon', '\\minuscoloncolon', '\\eqqcolon', '\\equalscolon', '\\Eqqcolon',
      '\\equalscoloncolon', '\\approxcolon', '\\approxcoloncolon', '\\approxeq', '\\asymp', '\\backepsilon',
      '\\backsim', '\\backsimeq', '\\between', '\\bowtie', '\\bumpeq', '\\Bumpeq', '\\circeq',
      '\\colonapprox', '\\Colonapprox', '\\coloncolonapprox', '\\coloneq', '\\colonminus', '\\Coloneq',
      '\\coloncolonminus', '\\coloneqq', '\\colonequals', '\\Coloneqq', '\\coloncolonequals',
      '\\colonsim', '\\Colonsim', '\\coloncolonsim', '\\cong', '\\curlyeqprec', '\\curlyeqsucc',
      '\\dashv', '\\dblcolon', '\\coloncolon', '\\doteq', '\\Doteq', '\\eqsim', '\\eqslantgtr',
      '\\eqslantless', '\\equiv', '\\fallingdotseq', '\\frown', '\\geqq', '\\geqslant', '\\gg',
      '\\ggg', '\\gggtr', '\\gtrapprox', '\\gtreqless', '\\gtreqqless', '\\gtrless', '\\gtrsim',
      '\\imageof', '\\Join', '\\leqq', '\\leqslant', '\\lessapprox', '\\lesseqgtr', '\\lesseqqgtr',
      '\\lessgtr', '\\lesssim', '\\ll', '\\lll', '\\llless', '\\models', '\\multimap', '\\origof',
      '\\owns', '\\parallel', '\\perp', '\\pitchfork', '\\prec', '\\precapprox', '\\preccurlyeq',
      '\\preceq', '\\precsim', '\\risingdotseq', '\\shortmid', '\\shortparallel', '\\sim', '\\simeq',
      '\\smallfrown', '\\smallsmile', '\\smile', '\\sqsubset', '\\sqsubseteq', '\\sqsupset',
      '\\sqsupseteq', '\\sub', '\\sube', '\\Subset', '\\subseteqq', '\\succ', '\\succapprox',
      '\\succcurlyeq', '\\succeq', '\\succsim', '\\supe', '\\Supset', '\\supseteqq', '\\thickapprox',
      '\\thicksim', '\\trianglelefteq', '\\triangleq', '\\trianglerighteq', '\\varpropto',
      '\\vartriangle', '\\vartriangleleft', '\\vartriangleright', '\\vcentcolon', '\\ratio',
      '\\vdash', '\\vDash', '\\Vdash', '\\Vvdash',
    ]),
  },
  {
    label: 'Negated Relations',
    items: commandItems([
      '\\not', '\\gnapprox', '\\gneq', '\\gneqq', '\\gnsim', '\\gvertneqq', '\\lnapprox', '\\lneq',
      '\\lneqq', '\\lnsim', '\\lvertneqq', '\\ncong', '\\ne', '\\neq', '\\ngeq', '\\ngeqq',
      '\\ngeqslant', '\\ngtr', '\\nleq', '\\nleqq', '\\nleqslant', '\\nless', '\\nmid',
      '\\notin', '\\notni', '\\nparallel', '\\nprec', '\\npreceq', '\\nshortmid',
      '\\nshortparallel', '\\nsim', '\\nsubseteq', '\\nsubseteqq', '\\nsucc', '\\nsucceq',
      '\\nsupseteq', '\\nsupseteqq', '\\ntriangleleft', '\\ntrianglelefteq', '\\ntriangleright',
      '\\ntrianglerighteq', '\\nvdash', '\\nvDash', '\\nVDash', '\\nVdash', '\\precnapprox',
      '\\precneqq', '\\precnsim', '\\subsetneq', '\\subsetneqq', '\\succnapprox', '\\succneqq',
      '\\succnsim', '\\supsetneq', '\\supsetneqq', '\\varsubsetneq', '\\varsubsetneqq',
      '\\varsupsetneq', '\\varsupsetneqq',
    ]),
  },
  {
    label: 'More Arrows',
    items: commandItems([
      '\\circlearrowleft', '\\circlearrowright', '\\curvearrowleft', '\\curvearrowright', '\\Darr',
      '\\dArr', '\\darr', '\\dashleftarrow', '\\dashrightarrow', '\\downdownarrows',
      '\\downharpoonleft', '\\downharpoonright', '\\gets', '\\Harr', '\\hArr', '\\harr',
      '\\hookleftarrow', '\\hookrightarrow', '\\iff', '\\impliedby', '\\implies', '\\Larr',
      '\\lArr', '\\larr', '\\leadsto', '\\Leftarrow', '\\leftarrowtail', '\\leftharpoondown',
      '\\leftharpoonup', '\\leftleftarrows', '\\leftrightarrows', '\\leftrightharpoons',
      '\\leftrightsquigarrow', '\\Lleftarrow', '\\longleftarrow', '\\Longleftarrow',
      '\\longleftrightarrow', '\\Longleftrightarrow', '\\longmapsto', '\\longrightarrow',
      '\\Longrightarrow', '\\looparrowleft', '\\looparrowright', '\\Lrarr', '\\lrArr',
      '\\lrarr', '\\Lsh', '\\mapsto', '\\nearrow', '\\nleftarrow', '\\nLeftarrow',
      '\\nleftrightarrow', '\\nLeftrightarrow', '\\nrightarrow', '\\nRightarrow', '\\nwarrow',
      '\\rArr', '\\rarr', '\\restriction', '\\rightarrowtail', '\\rightharpoondown',
      '\\rightharpoonup', '\\rightleftarrows', '\\rightleftharpoons', '\\rightrightarrows',
      '\\rightsquigarrow', '\\Rrightarrow', '\\Rsh', '\\searrow', '\\swarrow', '\\to',
      '\\twoheadleftarrow', '\\twoheadrightarrow', '\\Uarr', '\\uArr', '\\uarr', '\\upharpoonleft',
      '\\upharpoonright', '\\upuparrows',
    ]),
  },
  {
    label: 'Extensible Arrows',
    items: templateItems([
      ['xleftarrow', '\\xleftarrow{#?}'],
      ['xrightarrow', '\\xrightarrow[#?]{#?}'],
      ['xLeftarrow', '\\xLeftarrow{#?}'],
      ['xRightarrow', '\\xRightarrow{#?}'],
      ['xleftrightarrow', '\\xleftrightarrow{#?}'],
      ['xLeftrightarrow', '\\xLeftrightarrow{#?}'],
      ['xhookleftarrow', '\\xhookleftarrow{#?}'],
      ['xhookrightarrow', '\\xhookrightarrow{#?}'],
      ['xtwoheadleftarrow', '\\xtwoheadleftarrow{#?}'],
      ['xtwoheadrightarrow', '\\xtwoheadrightarrow{#?}'],
      ['xleftharpoonup', '\\xleftharpoonup{#?}'],
      ['xrightharpoonup', '\\xrightharpoonup{#?}'],
      ['xleftharpoondown', '\\xleftharpoondown{#?}'],
      ['xrightharpoondown', '\\xrightharpoondown{#?}'],
      ['xleftrightharpoons', '\\xleftrightharpoons{#?}'],
      ['xrightleftharpoons', '\\xrightleftharpoons{#?}'],
      ['xtofrom', '\\xtofrom{#?}'],
      ['xmapsto', '\\xmapsto{#?}'],
      ['xlongequal', '\\xlongequal{#?}'],
    ]),
  },
  {
    label: 'Notation',
    items: [
      ...templateItems([
        ['bra', '\\bra{#?}'],
        ['ket', '\\ket{#?}'],
        ['braket', '\\braket{#?}'],
        ['Bra', '\\Bra{#?}'],
        ['Ket', '\\Ket{#?}'],
        ['Braket', '\\Braket{#?}'],
        ['Set', '\\Set{#?}'],
        ['set', '\\set{#?}'],
      ]),
      ...commandItems([
        '\\complement', '\\therefore', '\\because', '\\empty', '\\varnothing', '\\exist',
        '\\nexists', '\\mid', '\\isin', '\\ni', '\\lnot',
      ]),
    ],
  },
  {
    label: 'Layout',
    items: [
      ...templateItems([
        ['cancel', '\\cancel{#?}'],
        ['bcancel', '\\bcancel{#?}'],
        ['xcancel', '\\xcancel{#?}'],
        ['sout', '\\sout{#?}'],
        ['boxed', '\\boxed{#?}'],
        ['phase', '\\phase{#?}'],
        ['tag', '\\tag{#?}'],
        ['tag*', '\\tag*{#?}'],
        ['stackrel', '\\stackrel{#?}{#?}'],
        ['raisebox', '\\raisebox{#?}{#?}'],
        ['vcenter', '\\vcenter{#?}'],
        ['hbox', '\\hbox{#?}'],
        ['substack', '\\substack{#?}'],
        ['mathllap', '\\mathllap{#?}'],
        ['mathrlap', '\\mathrlap{#?}'],
        ['mathclap', '\\mathclap{#?}'],
        ['smash', '\\smash{#?}'],
        ['smash[b]', '\\smash[b]{#?}'],
        ['llap', '\\llap{#?}'],
        ['rlap', '\\rlap{#?}'],
        ['clap', '\\clap{#?}'],
        ['phantom', '\\phantom{#?}'],
        ['hphantom', '\\hphantom{#?}'],
        ['vphantom', '\\vphantom{#?}'],
        ['kern', '\\kern{#?}'],
        ['mkern', '\\mkern{#?}'],
        ['mskip', '\\mskip{#?}'],
        ['hskip', '\\hskip{#?}'],
        ['hspace', '\\hspace{#?}'],
        ['hspace*', '\\hspace*{#?}'],
      ]),
      ...commandItems([
        '\\\\', '\\newline', '\\allowbreak', '\\nobreak', '\\,', '\\thinspace', '\\>', '\\:',
        '\\medspace', '\\;', '\\thickspace', '\\enspace', '\\quad', '\\qquad', '\\!', '\\negthinspace',
        '\\negmedspace', '\\negthickspace', '\\nobreakspace', '\\space', '\\mathstrut', '~',
      ]),
    ],
  },
  {
    label: 'Fonts & Style',
    items: [
      ...templateItems([
        ['mathrm', '\\mathrm{#?}'],
        ['mathbf', '\\mathbf{#?}'],
        ['mathsf', '\\mathsf{#?}'],
        ['mathnormal', '\\mathnormal{#?}'],
        ['textbf', '\\textbf{#?}'],
        ['textsf', '\\textsf{#?}'],
        ['textrm', '\\textrm{#?}'],
        ['bold', '\\bold{#?}'],
        ['mathsfit', '\\mathsfit{#?}'],
        ['textnormal', '\\textnormal{#?}'],
        ['boldsymbol', '\\boldsymbol{#?}'],
        ['Bbb', '\\Bbb{#?}'],
        ['text', '\\text{#?}'],
        ['bm', '\\bm{#?}'],
        ['mathbb', '\\mathbb{#?}'],
        ['textup', '\\textup{#?}'],
        ['textmd', '\\textmd{#?}'],
        ['frak', '\\frak{#?}'],
        ['mathit', '\\mathit{#?}'],
        ['mathtt', '\\mathtt{#?}'],
        ['mathfrak', '\\mathfrak{#?}'],
        ['textit', '\\textit{#?}'],
        ['texttt', '\\texttt{#?}'],
        ['mathcal', '\\mathcal{#?}'],
        ['emph', '\\emph{#?}'],
        ['mathscr', '\\mathscr{#?}'],
        ['pmb', '\\pmb{#?}'],
        ['mathbin', '\\mathbin{#?}'],
        ['mathclose', '\\mathclose{#?}'],
        ['mathinner', '\\mathinner{#?}'],
        ['mathop', '\\mathop{#?}'],
        ['mathopen', '\\mathopen{#?}'],
        ['mathord', '\\mathord{#?}'],
        ['mathpunct', '\\mathpunct{#?}'],
        ['mathrel', '\\mathrel{#?}'],
        ['textcolor', '\\textcolor{#?}{#?}'],
        ['colorbox', '\\colorbox{#?}{#?}'],
        ['fcolorbox', '\\fcolorbox{#?}{#?}{#?}'],
        ['color', '\\color{#?}'],
        ['verb', '\\verb|#?|'],
      ]),
      ...commandItems([
        '\\bf', '\\sf', '\\rm', '\\it', '\\tt', '\\cal', '\\Huge', '\\huge', '\\LARGE', '\\Large',
        '\\large', '\\normalsize', '\\small', '\\footnotesize', '\\scriptsize', '\\tiny',
        '\\displaystyle', '\\textstyle', '\\scriptstyle', '\\scriptscriptstyle', '\\limits', '\\nolimits',
      ]),
    ],
  },
  {
    label: 'Symbols',
    items: commandItems([
      '\\dots', '\\cdots', '\\ddots', '\\ldots', '\\vdots', '\\dotsb', '\\dotsc', '\\dotsi',
      '\\dotsm', '\\dotso', '\\mathellipsis', '\\KaTeX', '\\LaTeX', '\\TeX', '\\%', '\\#', '\\&',
      '\\_', '\\$', '\\infin', '\\checkmark', '\\dag', '\\dagger', '\\ddag', '\\ddagger', '\\Dagger',
      '\\Box', '\\square', '\\angle', '\\measuredangle', '\\sphericalangle', '\\top', '\\bot',
      '\\colon', '\\backprime', '\\prime', '\\lq', '\\rq', '\\bigtriangledown', '\\bigtriangleup',
      '\\blacktriangle', '\\blacktriangledown', '\\blacktriangleleft', '\\blacktriangleright',
      '\\triangle', '\\triangledown', '\\triangleleft', '\\triangleright', '\\diamond', '\\Diamond',
      '\\lozenge', '\\blacklozenge', '\\star', '\\bigstar', '\\clubsuit', '\\clubs', '\\diamondsuit',
      '\\diamonds', '\\heartsuit', '\\hearts', '\\spadesuit', '\\spades', '\\maltese', '\\flat',
      '\\natural', '\\sharp', '\\surd', '\\degree', '\\mho', '\\diagdown', '\\diagup', '\\P', '\\S',
      '\\sect', '\\copyright', '\\circledR', '\\circledS', '\\pounds', '\\mathsterling', '\\yen',
      '\\minuso',
    ]),
  },
  {
    label: 'HTML',
    items: templateItems([
      ['href', '\\href{#?}{#?}'],
      ['url', '\\url{#?}'],
      ['includegraphics', '\\includegraphics[height=#?]{#?}'],
      ['htmlId', '\\htmlId{#?}{#?}'],
      ['htmlClass', '\\htmlClass{#?}{#?}'],
      ['htmlStyle', '\\htmlStyle{#?}{#?}'],
      ['htmlData', '\\htmlData{#?}{#?}'],
    ]),
  },
  {
    label: 'Macros',
    items: templateItems([
      ['def', '\\def\\foo{#?}'],
      ['gdef', '\\gdef\\foo#1{#?}'],
      ['edef', '\\edef\\foo{#?}'],
      ['xdef', '\\xdef\\foo{#?}'],
      ['let', '\\let\\foo=\\bar'],
      ['futurelet', '\\futurelet\\foo\\bar #?'],
      ['global def', '\\global\\def\\foo{#?}'],
      ['newcommand', '\\newcommand\\foo[1]{#?}'],
      ['renewcommand', '\\renewcommand\\foo[1]{#?}'],
      ['providecommand', '\\providecommand\\foo[1]{#?}'],
      ['char', '\\char"#?'],
      ['mathchoice', '\\mathchoice{#?}{#?}{#?}{#?}'],
      ['TextOrMath', '\\TextOrMath{#?}{#?}'],
      ['@ifstar', '\\@ifstar{#?}{#?}'],
      ['@ifnextchar', '\\@ifnextchar#?{#?}{#?}'],
      ['@firstoftwo', '\\@firstoftwo{#?}{#?}'],
      ['@secondoftwo', '\\@secondoftwo{#?}{#?}'],
      ['relax', '\\relax'],
      ['expandafter', '\\expandafter#?'],
      ['noexpand', '\\noexpand#?'],
    ]),
  },
]

const DROPDOWN_GROUP_LABELS = [
  'Greek',
  'Environments',
  'Accents',
  'Delimiters',
  'Big Operators',
  'More Operators',
  'Fractions',
  'Relations',
  'More Relations',
  'Negated Relations',
  'Sets & Logic',
  'Arrows',
  'More Arrows',
  'Extensible Arrows',
  'Notation',
  'Layout',
  'Fonts & Style',
  'Symbols',
  'HTML',
  'Macros',
  'Functions',
]
const DROPDOWN_GROUP_LABEL_SET = new Set(DROPDOWN_GROUP_LABELS)
const GREEK_ALIAS_SYMBOL_VALUES = new Set(GREEK_ALIAS_VALUES)
const HEBREW_SYMBOL_VALUES = new Set(['\\aleph', '\\beth', '\\gimel', '\\daleth'])
const OTHER_LETTER_SYMBOL_VALUES = new Set([
  '\\imath',
  '\\jmath',
  '\\nabla',
  '\\partial',
  '\\Im',
  '\\image',
  '\\Re',
  '\\real',
  '\\Reals',
  '\\R',
  '\\reals',
  '\\N',
  '\\natnums',
  '\\Z',
  '\\cnums',
  '\\Complex',
  '\\Bbbk',
  '\\ell',
  '\\hbar',
  '\\hslash',
  '\\wp',
  '\\weierp',
  '\\Game',
  '\\Finv',
  '\\eth',
  '\\OE',
  '\\o',
  '\\O',
  '\\ss',
  '\\aa',
  '\\AA',
  '\\i',
  '\\j',
  '\\ae',
  '\\AE',
  '\\oe',
  '\\alef',
  '\\alefsym',
])

const FUNCTION_SECTION_VALUES: Array<{ label: string; values: string[] }> = [
  {
    label: 'Trigonometric',
    values: [
      '\\arccos',
      '\\arcsin',
      '\\arctan',
      '\\arctg',
      '\\arcctg',
      '\\cos',
      '\\cot',
      '\\cosec',
      '\\csc',
      '\\ctg',
      '\\sec',
      '\\sin',
      '\\tan',
      '\\tg',
    ],
  },
  {
    label: 'Hyperbolic',
    values: [
      '\\cosh',
      '\\coth',
      '\\cth',
      '\\sinh',
      '\\tanh',
      '\\ch',
      '\\sh',
      '\\th',
    ],
  },
  {
    label: 'Logarithmic & Exponential',
    values: [
      '\\exp',
      '\\lg',
      '\\ln',
      '\\log',
      '\\deg',
      '\\dim',
    ],
  },
  {
    label: 'Limits & Extrema',
    values: [
      '\\inf',
      '\\lim',
      '\\liminf',
      '\\limsup',
      '\\max',
      '\\min',
      '\\plim',
      '\\sup',
      '\\injlim',
      '\\projlim',
      '\\varinjlim',
      '\\varliminf',
      '\\varlimsup',
      '\\varprojlim',
    ],
  },
  {
    label: 'Algebra & Probability',
    values: [
      '\\arg',
      '\\argmax',
      '\\argmin',
      '\\det',
      '\\gcd',
      '\\hom',
      '\\ker',
      '\\Pr',
    ],
  },
  {
    label: 'Custom Operators',
    values: [
      '\\operatorname{f}',
      '\\operatorname*{f}',
      '\\operatornamewithlimits{f}',
    ],
  },
]

function SymbolDropdown({
  disabled,
  group,
  onInsertSnippet,
}: {
  disabled: boolean
  group: SymbolGroup
  onInsertSnippet: (snippet: string, mode: 'cmd' | 'write' | 'template' | 'func-slot') => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [openVariantKey, setOpenVariantKey] = useState<string | null>(null)
  const [indexedFunctionDefaults, setIndexedFunctionDefaults] = useState<Set<string>>(() => new Set())
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const [floatingTooltip, setFloatingTooltip] = useState<{ title: string; top: number; left: number; placement: 'above' | 'below' } | null>(null)
  const isFunctionsGroup = group.label === 'Functions'
  const isWideDropdown = isFunctionsGroup || group.items.some((item) => item.display.length > 4)
  const menuSections = group.label === 'Greek'
    ? [
      {
        label: 'Greek',
        items: group.items.filter((item) =>
          !GREEK_ALIAS_SYMBOL_VALUES.has(item.value)
          && !HEBREW_SYMBOL_VALUES.has(item.value)
          && !OTHER_LETTER_SYMBOL_VALUES.has(item.value)),
      },
      { label: 'Greek aliases', items: group.items.filter((item) => GREEK_ALIAS_SYMBOL_VALUES.has(item.value)) },
      { label: 'Hebrew', items: group.items.filter((item) => HEBREW_SYMBOL_VALUES.has(item.value)) },
      { label: 'Other letters', items: group.items.filter((item) => OTHER_LETTER_SYMBOL_VALUES.has(item.value)) },
    ]
    : isFunctionsGroup
      ? (() => {
        const usedValues = new Set<string>()
        const sections = FUNCTION_SECTION_VALUES
          .map((section) => {
            const sectionItems = section.values
              .map((value) => group.items.find((item) => item.value === value))
              .filter((item): item is SymbolItem => Boolean(item))
            sectionItems.forEach((item) => usedValues.add(item.value))
            return { label: section.label, items: sectionItems }
          })
          .filter((section) => section.items.length > 0)

        const uncategorized = group.items.filter((item) => !usedValues.has(item.value))
        if (uncategorized.length > 0) {
          sections.push({ label: 'Other', items: uncategorized })
        }

        return sections
      })()
      : [
        { label: null, items: group.items },
      ]

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const menuWidth = Math.min(isWideDropdown ? 480 : 288, window.innerWidth - 32)
    setMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - menuWidth - 16)),
    })
  }, [isWideDropdown])

  const showFloatingTooltip = useCallback((title: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const estimatedHalfWidth = Math.min(Math.max(title.length * 3.8, 42), 150)
    const placement = rect.top > 36 ? 'above' : 'below'
    setFloatingTooltip({
      title,
      top: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(estimatedHalfWidth + 8, Math.min(rect.left + rect.width / 2, window.innerWidth - estimatedHalfWidth - 8)),
      placement,
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setOpenVariantKey(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    if (!isOpen) {
      setOpenVariantKey(null)
      setFloatingTooltip(null)
    }
  }, [isOpen])

  return (
    <div className="toolbar-symbol-dropdown" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        className="symbol-btn symbol-dropdown-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          updateMenuPosition()
          setIsOpen((current) => !current)
        }}
      >
        <span>{group.label}</span>
        <FontAwesomeIcon icon={faChevronDown} />
      </button>
      {isOpen ? (
        <div
          className={`symbol-dropdown-menu${isWideDropdown ? ' symbol-dropdown-menu-functions' : ''}`}
          role="menu"
          style={menuPosition}
        >
          <div ref={menuRef} className="symbol-dropdown-menu-scroll custom-scrollbar-target">
            {menuSections.map((section) => (
              <div key={section.label ?? group.label} className="symbol-dropdown-section">
                {section.label ? <span className="symbol-dropdown-section-title">{section.label}</span> : null}
                <div className={`symbol-dropdown-section-grid${isWideDropdown ? ' symbol-dropdown-section-grid-functions' : ''}`}>
                  {section.items.map((item) => (
                    <div
                      key={`${section.label ?? group.label}-${item.value}`}
                      className={`cell-button-tooltip-wrap symbol-dropdown-item-wrap${isWideDropdown ? ' symbol-dropdown-item-wrap-functions' : ''}`}
                      onMouseEnter={(event) => showFloatingTooltip(item.title, event.currentTarget)}
                      onMouseLeave={() => setFloatingTooltip(null)}
                      onFocusCapture={(event) => showFloatingTooltip(item.title, event.currentTarget)}
                      onBlurCapture={() => setFloatingTooltip(null)}
                    >
                      {isFunctionsGroup ? (
                        <div className="symbol-dropdown-item-pair">
                          <div className="cell-button-tooltip-wrap">
                            <button
                              type="button"
                              className={`symbol-btn symbol-dropdown-item symbol-dropdown-item-functions${indexedFunctionDefaults.has(item.value) ? ' symbol-dropdown-item-functions-indexed-default' : ''}`}
                              role="menuitem"
                              title={item.title}
                              aria-label={item.title}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const useIndexedDefault = indexedFunctionDefaults.has(item.value)
                                onInsertSnippet(item.value, useIndexedDefault ? 'func-slot' : item.mode)
                                setIsOpen(false)
                              }}
                            >
                              {indexedFunctionDefaults.has(item.value) ? (
                                <span className="symbol-dropdown-item-variant-label">
                                  <span>{item.display}</span>
                                  <span className="symbol-dropdown-item-variant-slot" aria-hidden="true">
                                    <FontAwesomeIcon icon={faSquareRegular} />
                                  </span>
                                </span>
                              ) : item.display}
                            </button>
                            <span className="cell-button-tooltip">{item.title}</span>
                          </div>
                          <div className="cell-button-tooltip-wrap symbol-dropdown-item-variant-wrap">
                            <button
                              type="button"
                              className="symbol-btn symbol-dropdown-item-variant-trigger"
                              role="menuitem"
                              title={`${item.title} insertion options`}
                              aria-label={`${item.title} insertion options`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const key = `${section.label ?? group.label}-${item.value}`
                                setOpenVariantKey((current) => (current === key ? null : key))
                              }}
                            >
                              <FontAwesomeIcon icon={faChevronDown} />
                            </button>
                            {openVariantKey === `${section.label ?? group.label}-${item.value}` ? (
                              <div className="symbol-dropdown-item-variant-menu">
                                <button
                                  type="button"
                                  className="symbol-btn symbol-dropdown-item-variant-option"
                                  role="menuitem"
                                  title={`${item.title} with argument slot`}
                                  aria-label={`${item.title} with argument slot`}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    onInsertSnippet(item.value, 'func-slot')
                                    setIndexedFunctionDefaults((current) => {
                                      const next = new Set(current)
                                      next.add(item.value)
                                      return next
                                    })
                                    setOpenVariantKey(null)
                                    setIsOpen(false)
                                  }}
                                >
                                  <span className="symbol-dropdown-item-variant-label">
                                    <span>{item.display}</span>
                                    <span className="symbol-dropdown-item-variant-slot" aria-hidden="true">
                                      <FontAwesomeIcon icon={faSquareRegular} />
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="symbol-btn symbol-dropdown-item-variant-option"
                                  role="menuitem"
                                  title={item.title}
                                  aria-label={item.title}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    onInsertSnippet(item.value, item.mode)
                                    setIndexedFunctionDefaults((current) => {
                                      const next = new Set(current)
                                      next.delete(item.value)
                                      return next
                                    })
                                    setOpenVariantKey(null)
                                    setIsOpen(false)
                                  }}
                                >
                                  {item.display}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`symbol-btn symbol-dropdown-item${isWideDropdown ? ' symbol-dropdown-item-functions' : ''}`}
                            role="menuitem"
                            title={item.title}
                            aria-label={item.title}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              onInsertSnippet(item.value, item.mode)
                              setIsOpen(false)
                            }}
                          >
                            {item.display}
                          </button>
                          <span className="cell-button-tooltip">{item.title}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <CustomScrollbar targetRef={menuRef} className="custom-scrollbar-menu" />
          {floatingTooltip ? (
            <span
              className={`dropdown-floating-tooltip dropdown-floating-tooltip-${floatingTooltip.placement}`}
              style={{ top: `${floatingTooltip.top}px`, left: `${floatingTooltip.left}px` }}
            >
              {floatingTooltip.title}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function EditorToolbar({
  hasActiveCell,
  canSave,
  onInsertSnippet,
  onFormatText,
  onExportPdf,
  onExportLatex,
  onNewNotebook,
  onOpenNotebook,
  onSaveNotebook,
  onSaveNotebookAs,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: EditorToolbarProps) {
  const inlineSymbolGroups = SYMBOL_GROUPS.filter((group) => !DROPDOWN_GROUP_LABEL_SET.has(group.label))
  const dropdownSymbolGroups = DROPDOWN_GROUP_LABELS
    .map((label) => SYMBOL_GROUPS.find((group) => group.label === label))
    .filter((group): group is SymbolGroup => Boolean(group))
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const fileMenuContainerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isFileMenuOpen && !isEditMenuOpen) {
      return
    }

    function handleOutsideClick(event: MouseEvent) {
      if (fileMenuContainerRef.current && !fileMenuContainerRef.current.contains(event.target as Node)) {
        setIsFileMenuOpen(false)
        setIsEditMenuOpen(false)
        setIsExportMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isEditMenuOpen, isFileMenuOpen])

  const executeFileAction = (action: () => void) => {
    action()
    setIsFileMenuOpen(false)
    setIsEditMenuOpen(false)
    setIsExportMenuOpen(false)
  }

  const executeEditAction = (action: () => void) => {
    action()
    setIsFileMenuOpen(false)
    setIsEditMenuOpen(false)
    setIsExportMenuOpen(false)
  }

  return (
    <header className="editor-toolbar" ref={fileMenuContainerRef}>
      <div className="toolbar-row toolbar-row-menu">
        <div className="toolbar-group">
          <button
            type="button"
            className={`menu-bar-button${isFileMenuOpen ? ' menu-bar-button-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={isFileMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsFileMenuOpen((current) => !current)
              setIsEditMenuOpen(false)
              setIsExportMenuOpen(false)
            }}
          >
            <span>File</span>
          </button>
          <button
            type="button"
            className={`menu-bar-button${isEditMenuOpen ? ' menu-bar-button-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={isEditMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsEditMenuOpen((current) => !current)
              setIsFileMenuOpen(false)
              setIsExportMenuOpen(false)
            }}
          >
            <span>Edit</span>
          </button>
        </div>
      </div>
      <div className="toolbar-row toolbar-row-contextual">
        <div className="toolbar-symbols-wrap">
          {/* Quick-access notation buttons */}
          <div className="toolbar-group toolbar-group-bordered">
            <span className="toolbar-group-label">Notation</span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Fraction — creates numerator/denominator slots"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\frac', 'cmd')}
              >
                a/b
              </button>
              <span className="cell-button-tooltip">Fraction</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Square root — type inside the radical"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\sqrt', 'cmd')}
              >
                <FontAwesomeIcon icon={faSquareRootVariable} />
              </button>
              <span className="cell-button-tooltip">Square root</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Indexed root - type the root number, then the radicand"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\sqrt[]', 'cmd')}
              >
                <span className="nth-root-symbol">n</span>
                <FontAwesomeIcon icon={faSquareRootVariable} />
              </button>
              <span className="cell-button-tooltip">Indexed root</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Superscript / Power — type the exponent"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('^', 'cmd')}
              >
                xⁿ
              </button>
              <span className="cell-button-tooltip">Power / Exponent</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Subscript — type the subscript"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('_', 'cmd')}
              >
                xₙ
              </button>
              <span className="cell-button-tooltip">Subscript</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Lower bound"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\underset', 'cmd')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: '1px' }}>
                  <span style={{ fontSize: '0.7em' }}>x</span>
                  <span style={{ fontSize: '0.55em' }}>a</span>
                </div>
              </button>
              <span className="cell-button-tooltip">Lower bound</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Upper bound"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\overset', 'cmd')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: '1px' }}>
                  <span style={{ fontSize: '0.55em' }}>b</span>
                  <span style={{ fontSize: '0.7em' }}>x</span>
                </div>
              </button>
              <span className="cell-button-tooltip">Upper bound</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Lower and upper bounds"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\bothset', 'cmd')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: '0px' }}>
                  <span style={{ fontSize: '0.5em' }}>b</span>
                  <span style={{ fontSize: '0.65em' }}>x</span>
                  <span style={{ fontSize: '0.5em' }}>a</span>
                </div>
              </button>
              <span className="cell-button-tooltip">Lower and upper bounds</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Absolute value"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\left|\\right|', 'write')}
              >
                |x|
              </button>
              <span className="cell-button-tooltip">Absolute value</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Parentheses"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\left(\\right)', 'write')}
              >
                ()
              </button>
              <span className="cell-button-tooltip">Parentheses</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Brackets"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\left[\\right]', 'write')}
              >
                []
              </button>
              <span className="cell-button-tooltip">Brackets</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button
                type="button"
                aria-label="Curly braces"
                disabled={!hasActiveCell}
                className="symbol-btn symbol-btn-featured"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertSnippet('\\left\\lbrace\\right\\rbrace', 'write')}
              >
                {'{ }'}
              </button>
              <span className="cell-button-tooltip">Curly braces</span>
            </span>
          </div>

          {/* Symbol groups */}
          {inlineSymbolGroups.map((group) => (
            <div key={group.label} className="toolbar-group toolbar-group-bordered">
              <span className="toolbar-group-label">{group.label}</span>
              {group.items.map((item) => (
                <span key={item.title} className="cell-button-tooltip-wrap">
                  <button
                    type="button"
                    aria-label={item.title}
                    disabled={!hasActiveCell}
                    className="symbol-btn"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsertSnippet(item.value, item.mode)}
                  >
                    {item.display}
                  </button>
                  <span className="cell-button-tooltip">{item.title}</span>
                </span>
              ))}
            </div>
          ))}

          <MatrixDropdown disabled={!hasActiveCell} onInsertSnippet={onInsertSnippet} />

          {dropdownSymbolGroups.map((group) => (
            <div key={group.label} className="toolbar-group toolbar-group-bordered">
              <SymbolDropdown disabled={!hasActiveCell} group={group} onInsertSnippet={onInsertSnippet} />
            </div>
          ))}
        </div>
      </div>
      <div className="toolbar-row toolbar-row-file-actions">
        <div className="toolbar-group">
          <div className="title-icon-actions" aria-label="File actions">
            <span className="cell-button-tooltip-wrap tooltip-edge-safe-left">
              <button type="button" className="icon-button icon-button-compact" onClick={onNewNotebook}>
                <FontAwesomeIcon icon={faFile} />
              </button>
              <span className="cell-button-tooltip">New Document</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" onClick={onOpenNotebook}>
                <FontAwesomeIcon icon={faFolderOpen} />
              </button>
              <span className="cell-button-tooltip">Open</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!canSave} onClick={onSaveNotebook}>
                <FontAwesomeIcon icon={faFloppyDisk} />
              </button>
              <span className="cell-button-tooltip">Save</span>
            </span>
            <span className="toolbar-action-divider" aria-hidden="true" />
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!canUndo} onMouseDown={(event) => event.preventDefault()} onClick={onUndo}>
                <FontAwesomeIcon icon={faArrowRotateLeft} />
              </button>
              <span className="cell-button-tooltip">Undo</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!canRedo} onMouseDown={(event) => event.preventDefault()} onClick={onRedo}>
                <FontAwesomeIcon icon={faArrowRotateRight} />
              </button>
              <span className="cell-button-tooltip">Redo</span>
            </span>
            <span className="toolbar-action-divider" aria-hidden="true" />
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('bold')}>
                <FontAwesomeIcon icon={faBold} />
              </button>
              <span className="cell-button-tooltip">Bold</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('italic')}>
                <FontAwesomeIcon icon={faItalic} />
              </button>
              <span className="cell-button-tooltip">Italic</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('underline')}>
                <FontAwesomeIcon icon={faUnderline} />
              </button>
              <span className="cell-button-tooltip">Underline</span>
            </span>
            <span className="toolbar-action-divider" aria-hidden="true" />
            {[1, 2, 3, 4].map((level) => (
              <span key={level} className="cell-button-tooltip-wrap">
                <button
                  type="button"
                  className="icon-button icon-button-compact heading-format-button"
                  disabled={!hasActiveCell}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onFormatText(`heading${level}` as TextFormatCommand)}
                >
                  <FontAwesomeIcon icon={faHeading} />
                  <span className="heading-format-level">{level}</span>
                </button>
                <span className="cell-button-tooltip">Heading {level}</span>
              </span>
            ))}
            <span className="toolbar-action-divider" aria-hidden="true" />
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('bulletList')}>
                <FontAwesomeIcon icon={faListUl} />
              </button>
              <span className="cell-button-tooltip">Bullets</span>
            </span>
            <span className="cell-button-tooltip-wrap">
              <button type="button" className="icon-button icon-button-compact" disabled={!hasActiveCell} onMouseDown={(event) => event.preventDefault()} onClick={() => onFormatText('numberedList')}>
                <FontAwesomeIcon icon={faListOl} />
              </button>
              <span className="cell-button-tooltip">Numbering</span>
            </span>
          </div>
        </div>
      </div>
      <div className={`file-menu-drawer${isFileMenuOpen ? ' file-menu-drawer-open' : ''}`} role="menu" aria-label="File">
        <button type="button" className="file-menu-item" role="menuitem" onClick={() => executeFileAction(onNewNotebook)}>
          <FontAwesomeIcon icon={faFile} style={{ width: '1rem', marginRight: '0.4rem' }} /> New Document
        </button>
        <button type="button" className="file-menu-item" role="menuitem" onClick={() => executeFileAction(onOpenNotebook)}>
          <FontAwesomeIcon icon={faFolderOpen} style={{ width: '1rem', marginRight: '0.4rem' }} /> Open Existing Document
        </button>
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canSave} onClick={() => executeFileAction(onSaveNotebook)}>
          <FontAwesomeIcon icon={faFloppyDisk} style={{ width: '1rem', marginRight: '0.4rem' }} /> Save File
        </button>
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canSave} onClick={() => executeFileAction(onSaveNotebookAs)}>
          <FontAwesomeIcon icon={faFloppyDisk} style={{ width: '1rem', marginRight: '0.4rem' }} /> Save As…
        </button>
        <div className="menu-divider" />
        <div className="file-menu-export">
          <button
            type="button"
            className={`file-menu-item file-menu-export-trigger${isExportMenuOpen ? ' file-menu-export-trigger-open' : ''}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isExportMenuOpen}
            disabled={!canSave}
            onClick={() => setIsExportMenuOpen((current) => !current)}
          >
            <span><FontAwesomeIcon icon={faFileExport} style={{ width: '1rem', marginRight: '0.4rem' }} /> Export As…</span>
            <FontAwesomeIcon icon={faChevronDown} />
          </button>
          {isExportMenuOpen ? (
            <div className="file-menu-export-options" role="menu">
              <button type="button" className="file-menu-item file-menu-export-item" role="menuitem" onClick={() => executeFileAction(onExportPdf)}>
                <FontAwesomeIcon icon={faFilePdf} style={{ width: '1rem', marginRight: '0.4rem' }} /> PDF (.pdf)
              </button>
              <button type="button" className="file-menu-item file-menu-export-item" role="menuitem" onClick={() => executeFileAction(onExportLatex)}>
                <FontAwesomeIcon icon={faFileCode} style={{ width: '1rem', marginRight: '0.4rem' }} /> LaTeX (.tex)
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className={`file-menu-drawer edit-menu-drawer${isEditMenuOpen ? ' file-menu-drawer-open' : ''}`} role="menu" aria-label="Edit">
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canUndo} onClick={() => executeEditAction(onUndo)}>
          <FontAwesomeIcon icon={faArrowRotateLeft} style={{ width: '1rem', marginRight: '0.4rem' }} /> Undo
        </button>
        <button type="button" className="file-menu-item" role="menuitem" disabled={!canRedo} onClick={() => executeEditAction(onRedo)}>
          <FontAwesomeIcon icon={faArrowRotateRight} style={{ width: '1rem', marginRight: '0.4rem' }} /> Redo
        </button>
        <div className="menu-divider" />
        <button type="button" className="file-menu-item" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(() => document.execCommand('cut'))}>
          <FontAwesomeIcon icon={faScissors} style={{ width: '1rem', marginRight: '0.4rem' }} /> Cut
        </button>
        <button type="button" className="file-menu-item" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(() => document.execCommand('copy'))}>
          <FontAwesomeIcon icon={faCopy} style={{ width: '1rem', marginRight: '0.4rem' }} /> Copy
        </button>
        <button type="button" className="file-menu-item" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => executeEditAction(async () => {
          try {
            const text = await navigator.clipboard.readText()
            document.execCommand('insertText', false, text)
          } catch(e) {
            console.error(e)
          }
        })}>
          <FontAwesomeIcon icon={faPaste} style={{ width: '1rem', marginRight: '0.4rem' }} /> Paste
        </button>
      </div>
    </header>
  )
}
