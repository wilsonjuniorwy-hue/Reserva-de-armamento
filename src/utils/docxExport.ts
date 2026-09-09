/**
 * Utilitário para geração e download de relatórios e atas em formato Microsoft Word (.docx).
 * Polícia Militar do Distrito Federal - Gestão de Reserva de Armamento.
 */

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ImageRun,
  ITableBordersOptions,
  IBorderOptions,
  Packer
} from 'docx';
import { OcorrenciaRelatorio, Usuario } from '../types';
import { formatPostoGraduacaoSigla } from './rankUtils';

/**
 * Normaliza e limpa a matrícula exibida (remove prefixo 'A' se houver).
 */
export function limparMatricula(m?: string): string {
  if (!m) return '';
  return m.toUpperCase().startsWith('A') ? m.substring(1) : m;
}

/**
 * Converte Data URL base64 de imagem para Uint8Array para uso no ImageRun do docx.
 */
function base64ToUint8Array(base64DataUrl: string): Uint8Array {
  const base64 = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface ParsedHandover {
  title: string;
  subText: string;
  oficialCPU: string;
  adjuntoCPU: string;
  armeiroDia: string;
  stockItems: Array<{
    material: string;
    carregadores: string;
    total: string;
    disponivel: string;
    cautelado: string;
    manutencao: string;
  }>;
  pendenciasText: string;
  confText: string;
  passagemText: string;
  dateLine: string;
}

/**
 * Realiza o parsing do texto padrão gerado na ata de passagem de serviço (troca_turno).
 */
export function parseHandoverDescription(desc: string): ParsedHandover {
  const lines = desc.split('\n');
  let title = '';
  let subText = '';
  let oficialCPU = '';
  let adjuntoCPU = '';
  let armeiroDia = '';
  const stockItems: Array<{
    material: string;
    carregadores: string;
    total: string;
    disponivel: string;
    cautelado: string;
    manutencao: string;
  }> = [];
  let pendenciasText = '';
  let passagemText = '';
  let dateLine = '';
  let confText = '';

  let currentSection = '';
  let skippingStockConference = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (i === 0) {
      title = line;
      continue;
    }

    if (line.startsWith('Assumi o serviço em substituição')) {
      subText = line;
      continue;
    }

    if (line === 'SERVIÇO DIÁRIO' || line === 'SERVICO DIARIO') {
      currentSection = 'SERVIÇO_DIARIO';
      continue;
    }

    if (
      line === 'MATERIAL CARGA' ||
      line === 'ESTOQUE FÍSICO DO PAIOL CONFERIDO' ||
      line === 'ESTOQUE FISICO DO PAIOL CONFERIDO'
    ) {
      currentSection = 'MATERIAL_CARGA';
      continue;
    }

    if (
      line === 'SITUAÇÃO DAS ALTERAÇÕES E PENDÊNCIAS DO SERVIÇO' ||
      line === 'SITUACAO DAS ALTERACOES E PENDENCIAS DO SERVICO'
    ) {
      currentSection = 'PENDENCIAS';
      continue;
    }

    if (
      line === 'CONFERÊNCIA FÍSICA E QUANTITATIVA' ||
      line === 'CONFERENCIA FISICA E QUANTITATIVA'
    ) {
      currentSection = 'CONFERENCIA';
      continue;
    }

    if (line === 'PASSAGEM DE SERVIÇO' || line === 'PASSAGEM DE SERVICO') {
      currentSection = 'PASSAGEM';
      continue;
    }

    if (currentSection === 'SERVIÇO_DIARIO') {
      const clean = line.startsWith('-') ? line.substring(1).trim() : line;
      if (/^Oficial\s*(de\s*Dia|CPU)\s*:/i.test(clean)) {
        oficialCPU = clean.replace(/^Oficial\s*(de\s*Dia|CPU)\s*:/i, '').trim();
      } else if (/^Adjunto\s*(ao\s*CPU|de\s*Servi[çc]o)?\s*:/i.test(clean)) {
        adjuntoCPU = clean.replace(/^Adjunto\s*(ao\s*CPU|de\s*Servi[çc]o)?\s*:/i, '').trim();
      } else if (/^Armeiro\s*(de\s*Servi[çc]o|de\s*dia|do\s*dia)?\s*:/i.test(clean)) {
        armeiroDia = clean.replace(/^Armeiro\s*(de\s*Servi[çc]o|de\s*dia|do\s*dia)?\s*:/i, '').trim();
      }
    } else if (currentSection === 'MATERIAL_CARGA') {
      if (line.startsWith('-')) {
        const content = line.substring(1).trim();
        const colonIdx = content.indexOf(':');
        const namePart = colonIdx !== -1 ? content.substring(0, colonIdx).trim() : content;
        const rest = colonIdx !== -1 ? content.substring(colonIdx + 1).trim() : '';

        let carregadores = '0';
        let total = '0';
        let disponivel = '0';
        let cautelado = '0';
        let manutencao = '0';

        const totalMatch = rest.match(/(\d+)\s*un/i);
        if (totalMatch) total = totalMatch[1];

        const carrMatch = rest.match(/\+\s*(\d+)\s*carregadores/i);
        if (carrMatch) carregadores = carrMatch[1];

        const dispMatch = rest.match(/Dispon[íi]vel:\s*(\d+)/i) || rest.match(/(\d+)\s*un\.?\s*disp/i);
        if (dispMatch) disponivel = dispMatch[1];

        const cautMatch = rest.match(/Cautelado:\s*(\d+)/i) || rest.match(/(\d+)\s*un\.?\s*em\s*campo/i);
        if (cautMatch) cautelado = cautMatch[1];

        const manutMatch = rest.match(/Manuten[çc][ãa]o:\s*(\d+)/i);
        if (manutMatch) manutencao = manutMatch[1];

        stockItems.push({
          material: namePart.trim(),
          carregadores,
          total,
          disponivel,
          cautelado,
          manutencao
        });
      }
    } else if (currentSection === 'PENDENCIAS') {
      const isStockConfStart = 
        line.toUpperCase().includes('[CONFERENCIA ESTOQUE]') ||
        line.toUpperCase().includes('[CONFERÊNCIA ESTOQUE]') ||
        line.includes('=== CONFERÊNCIA FÍSICA E QUANTITATIVA DE ESTOQUE ===') ||
        line.includes('=== CONFERENCIA FISICA E QUANTITATIVA DE ESTOQUE ===');

      if (isStockConfStart) {
        skippingStockConference = true;
        continue;
      }

      if (skippingStockConference) {
        const isNextBlock = 
          line.startsWith('[OCORRÊNCIA') ||
          line.startsWith('[OCORRENCIA') ||
          line.startsWith('2. PENDÊNCIAS') ||
          line.startsWith('2. PENDENCIAS');
        if (isNextBlock) {
          skippingStockConference = false;
        } else {
          continue;
        }
      }

      pendenciasText += (pendenciasText ? '\n' : '') + line;
    } else if (currentSection === 'CONFERENCIA') {
      confText += (confText ? '\n' : '') + line;
    } else if (currentSection === 'PASSAGEM') {
      if (line.startsWith('Riacho Fundo I') || /^[a-zA-Z\s]+-\s*DF,/i.test(line)) {
        dateLine = line;
      } else {
        passagemText += (passagemText ? '\n' : '') + line;
      }
    }
  }

  const pendenciasLimpo = pendenciasText
    .replace(/^1\.\s*OCORR[ÊE]NCIAS\s*E\s*EVENTOS\s*REGISTRADOS\s*NO\s*LIVRO\s*DIGITAL:\s*$/im, '')
    .trim();

  if (!pendenciasLimpo) {
    pendenciasText = 'Nenhuma alteração, ocorrência ou pendência registrada durante o plantão.';
    if (passagemText.includes('com as seguintes alterações')) {
      passagemText = passagemText.replace('com as seguintes alterações', 'sem alterações');
    }
  } else {
    pendenciasText = pendenciasLimpo;
  }

  return {
    title,
    subText,
    oficialCPU,
    adjuntoCPU,
    armeiroDia,
    stockItems,
    pendenciasText,
    confText,
    passagemText,
    dateLine
  };
}

/**
 * Cria e dispara o download do documento Word (.docx) da Ata de Passagem de Serviço / Livro Diário.
 */
export async function exportarPassagemServicoDocx(
  ocorrencia: OcorrenciaRelatorio,
  armeiroUser?: Usuario | null,
  quartelNome?: string
): Promise<void> {
  const parsed = parseHandoverDescription(ocorrencia.descricao);

  const cleanMat = armeiroUser?.matricula
    ? limparMatricula(armeiroUser.matricula)
    : limparMatricula(ocorrencia.matricula_armeiro);

  const armeiroNomeCompleto = armeiroUser
    ? `${formatPostoGraduacaoSigla(armeiroUser.posto_graduacao)} ${armeiroUser.nome_de_guerra || armeiroUser.nome}`
    : 'Armeiro Responsável';

  const unitName = quartelNome
    ? quartelNome.toUpperCase()
    : 'REGIMENTO DE POLÍCIA MONTADA (RPMONT / CAVALARIA)';

  // Configuração padrão de bordas sólidas pretas
  const singleBorder: IBorderOptions = {
    style: BorderStyle.SINGLE,
    size: 4, // 1/2 pt
    color: '000000'
  };

  const tableBorders: ITableBordersOptions = {
    top: singleBorder,
    bottom: singleBorder,
    left: singleBorder,
    right: singleBorder,
    insideHorizontal: singleBorder,
    insideVertical: singleBorder
  };

  // Margem interna padrão das células (em twips)
  const cellMargins = {
    top: 100,
    bottom: 100,
    left: 140,
    right: 140
  };

  // 1. Metadados do Registro (Tabela Superior)
  const metadataTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    margins: cellMargins,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Código Registro:', bold: true, size: 18, font: 'Arial' })]
              })
            ]
          }),
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: ocorrencia.id_ocorrencia, size: 18, font: 'Arial' })]
              })
            ]
          }),
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Data/Hora Registro:', bold: true, size: 18, font: 'Arial' })]
              })
            ]
          }),
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: new Date(ocorrencia.data_hora).toLocaleString('pt-BR'),
                    size: 18,
                    font: 'Arial'
                  })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Tipo de Ocorrência:', bold: true, size: 18, font: 'Arial' })]
              })
            ]
          }),
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: ocorrencia.tipo.toUpperCase().replace('_', ' '),
                    size: 18,
                    font: 'Arial'
                  })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Armeiro Relator:', bold: true, size: 18, font: 'Arial' })]
              })
            ]
          }),
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: `Mat. ${cleanMat}`, size: 18, font: 'Arial' })]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Assunto / Título:', bold: true, size: 18, font: 'Arial' })]
              })
            ]
          }),
          new TableCell({
            columnSpan: 3,
            width: { size: 78, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: ocorrencia.titulo.toUpperCase(),
                    bold: true,
                    size: 18,
                    font: 'Arial'
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });

  // 2. Tabela de Material Carga (Paiol Conferido)
  const stockRows: TableRow[] = [
    // Header
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 44, type: WidthType.PERCENTAGE },
          shading: { fill: 'F2F2F2' },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Material (Modelo/Fabricante)', bold: true, size: 17, font: 'Arial' })
              ]
            })
          ]
        }),
        new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'F2F2F2' },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Qtd Total', bold: true, size: 17, font: 'Arial' })]
            })
          ]
        }),
        new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'F2F2F2' },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Disponível', bold: true, size: 17, font: 'Arial' })]
            })
          ]
        }),
        new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'F2F2F2' },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Cautelado (Rua)', bold: true, size: 17, font: 'Arial' })]
            })
          ]
        }),
        new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'F2F2F2' },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Manutenção', bold: true, size: 17, font: 'Arial' })]
            })
          ]
        })
      ]
    })
  ];

  if (parsed.stockItems && parsed.stockItems.length > 0) {
    parsed.stockItems.forEach((item) => {
      const showCarregadores = parseInt(item.carregadores) > 0;
      const displayName = showCarregadores
        ? `${item.material} (+ ${item.carregadores} carregadores)`
        : item.material;

      stockRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: displayName, size: 17, font: 'Arial' })]
                })
              ]
            }),
            new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: item.total, bold: true, size: 17, font: 'Arial' })]
                })
              ]
            }),
            new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: item.disponivel, size: 17, font: 'Arial' })]
                })
              ]
            }),
            new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: item.cautelado, size: 17, font: 'Arial' })]
                })
              ]
            }),
            new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: item.manutencao, size: 17, font: 'Arial' })]
                })
              ]
            })
          ]
        })
      );
    });
  } else {
    stockRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 5,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Nenhum item de estoque registrado ou conferido.',
                    italics: true,
                    size: 17,
                    font: 'Arial'
                  })
                ]
              })
            ]
          })
        ]
      })
    );
  }

  const stockTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    margins: cellMargins,
    rows: stockRows
  });

  // 3. Montagem dos parágrafos do documento
  const children: (Paragraph | Table)[] = [];

  // Cabeçalho Institucional PMDF
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: 'POLÍCIA MILITAR DO DISTRITO FEDERAL',
          bold: true,
          size: 24, // 12pt
          font: 'Arial',
          color: '000000'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: unitName,
          bold: true,
          size: 20, // 10pt
          font: 'Arial',
          color: '222222'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' }
      },
      children: [
        new TextRun({
          text: 'TERMO DE REGISTRO DE OCORRÊNCIA BÉLICA - ATA DE PASSAGEM DE SERVIÇO',
          bold: true,
          size: 21, // 10.5pt
          font: 'Arial'
        })
      ]
    })
  );

  // Tabela de Metadados
  children.push(metadataTable);

  // Espaço pós tabela
  children.push(new Paragraph({ spacing: { after: 200 } }));

  // Título da Ata e Subtexto
  if (parsed.title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 180, after: 120 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '444444' }
        },
        children: [
          new TextRun({
            text: parsed.title.toUpperCase(),
            bold: true,
            size: 22, // 11pt
            font: 'Arial'
          })
        ]
      })
    );
  }

  if (parsed.subText) {
    children.push(
      new Paragraph({
        indent: { firstLine: 720 }, // ~1.27 cm
        spacing: { after: 180 },
        children: [
          new TextRun({
            text: parsed.subText,
            size: 20, // 10pt
            font: 'Arial'
          })
        ]
      })
    );
  }

  // Seção: SERVIÇO DIÁRIO
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 100 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' }
      },
      children: [
        new TextRun({
          text: 'SERVIÇO DIÁRIO',
          bold: true,
          size: 19,
          font: 'Arial'
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 60 },
      indent: { left: 360 },
      children: [
        new TextRun({ text: '• Oficial CPU / Oficial de Dia: ', bold: true, size: 19, font: 'Arial' }),
        new TextRun({ text: parsed.oficialCPU || 'Não informado', size: 19, font: 'Arial' })
      ]
    }),
    new Paragraph({
      spacing: { after: 60 },
      indent: { left: 360 },
      children: [
        new TextRun({ text: '• Adjunto ao CPU / de Serviço: ', bold: true, size: 19, font: 'Arial' }),
        new TextRun({ text: parsed.adjuntoCPU || 'Não informado', size: 19, font: 'Arial' })
      ]
    }),
    new Paragraph({
      spacing: { after: 180 },
      indent: { left: 360 },
      children: [
        new TextRun({ text: '• Armeiro de Serviço (Dia): ', bold: true, size: 19, font: 'Arial' }),
        new TextRun({ text: parsed.armeiroDia || armeiroNomeCompleto, size: 19, font: 'Arial' })
      ]
    })
  );

  // Seção: MATERIAL CARGA
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' }
      },
      children: [
        new TextRun({
          text: 'MATERIAL CARGA (ESTOQUE FÍSICO DO PAIOL CONFERIDO)',
          bold: true,
          size: 19,
          font: 'Arial'
        })
      ]
    }),
    stockTable
  );

  // Seção: SITUAÇÃO DAS ALTERAÇÕES E PENDÊNCIAS
  children.push(
    new Paragraph({
      spacing: { before: 240, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' }
      },
      children: [
        new TextRun({
          text: 'SITUAÇÃO DAS ALTERAÇÕES E PENDÊNCIAS DO SERVIÇO',
          bold: true,
          size: 19,
          font: 'Arial'
        })
      ]
    })
  );

  if (parsed.pendenciasText && parsed.pendenciasText.trim()) {
    const pendenciasLines = parsed.pendenciasText.split('\n');
    pendenciasLines.forEach((l) => {
      const lineTrim = l.trim();
      if (!lineTrim) {
        children.push(new Paragraph({ spacing: { after: 60 } }));
        return;
      }

      // Se for subtítulo de grupo (ex: "1. OCORRÊNCIAS E EVENTOS..." ou "2. PENDÊNCIAS...")
      if (/^\d+\.\s+[A-ZÇÃÉÊÍÓÔÚ\s]+:?$/.test(lineTrim)) {
        children.push(
          new Paragraph({
            spacing: { before: 140, after: 60 },
            indent: { left: 240 },
            children: [
              new TextRun({
                text: lineTrim,
                bold: true,
                size: 18,
                font: 'Arial',
                color: '111111'
              })
            ]
          })
        );
      } else if (lineTrim.startsWith('[OCORRÊNCIA') || lineTrim.startsWith('[PENDÊNCIA')) {
        // Título do item (ex: "[OCORRÊNCIA 1] • 29/08 06:30 [OUTROS]: ENTRADA DE MATERIAL")
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            indent: { left: 400 },
            children: [
              new TextRun({
                text: lineTrim,
                bold: true,
                size: 18,
                font: 'Arial'
              })
            ]
          })
        );
      } else {
        // Corpo / descrição do registro
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: { left: 560 },
            children: [
              new TextRun({
                text: lineTrim,
                size: 18,
                font: 'Arial'
              })
            ]
          })
        );
      }
    });
  } else {
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 180 },
        children: [
          new TextRun({
            text: 'Nenhuma alteração, ocorrência ou pendência registrada durante o plantão.',
            italics: true,
            size: 18,
            font: 'Arial'
          })
        ]
      })
    );
  }

  // Seção: CONFERÊNCIA FÍSICA E QUANTITATIVA (se houver)
  if (parsed.confText) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' }
        },
        children: [
          new TextRun({
            text: 'CONFERÊNCIA FÍSICA E QUANTITATIVA',
            bold: true,
            size: 19,
            font: 'Arial'
          })
        ]
      }),
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 180 },
        children: [
          new TextRun({
            text: parsed.confText,
            italics: true,
            size: 19,
            font: 'Arial'
          })
        ]
      })
    );
  }

  // Seção: PASSAGEM DE SERVIÇO
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' }
      },
      children: [
        new TextRun({
          text: 'PASSAGEM DE SERVIÇO',
          bold: true,
          size: 19,
          font: 'Arial'
        })
      ]
    }),
    new Paragraph({
      indent: { firstLine: 720 },
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: parsed.passagemText || 'Passagem realizada com as ordens em vigor.',
          size: 19,
          font: 'Arial'
        })
      ]
    })
  );

  // Linha de Data / Local
  if (parsed.dateLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 120, after: 260 },
        children: [
          new TextRun({
            text: parsed.dateLine,
            bold: true,
            italics: true,
            size: 19,
            font: 'Arial'
          })
        ]
      })
    );
  }

  // Bloco de Assinatura Eletrônica Digital Institucional PMDF
  const signatureParagraphs: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 40 },
      border: {
        top: { style: BorderStyle.DASHED, size: 6, color: '666666' }
      },
      children: [
        new TextRun({
          text: 'DOCUMENTO ASSINADO ELETRONICAMENTE PELO USUÁRIO MEDIANTE SENHA PESSOAL E INTRANSFERÍVEL.',
          bold: true,
          size: 17,
          font: 'Arial',
          color: '111111'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: 'Conforme Lei Federal nº 14.063/2020 e normas de segurança orgânica da PMDF.',
          italics: true,
          size: 15,
          font: 'Arial',
          color: '444444'
        })
      ]
    })
  ];

  // Se houver imagem da assinatura digitalizada anexada no perfil
  if (armeiroUser?.assinatura_foto) {
    try {
      const imgBytes = base64ToUint8Array(armeiroUser.assinatura_foto);
      signatureParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new ImageRun({
              data: imgBytes,
              type: 'png',
              transformation: {
                width: 150,
                height: 50
              }
            })
          ]
        })
      );
    } catch (e) {
      console.warn('Não foi possível carregar a imagem da assinatura no DOCX:', e);
    }
  }

  // Linha e identificação do armeiro
  signatureParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 40 },
      children: [
        new TextRun({
          text: '____________________________________________________________',
          bold: true,
          size: 18,
          font: 'Arial'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [
        new TextRun({
          text: armeiroNomeCompleto,
          bold: true,
          size: 19,
          font: 'Arial'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Armeiro de Serviço • Matrícula: ${cleanMat}`,
          size: 17,
          font: 'Arial',
          color: '333333'
        })
      ]
    })
  );

  children.push(...signatureParagraphs);

  // Criação do Documento Word
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1417, // ~2.5 cm
              bottom: 1417,
              left: 1417,
              right: 1417
            }
          }
        },
        children
      }
    ]
  });

  const ocoDate = new Date(ocorrencia.data_hora);
  const yyyy = ocoDate.getFullYear();
  const mm = String(ocoDate.getMonth() + 1).padStart(2, '0');
  const dd = String(ocoDate.getDate()).padStart(2, '0');
  const fileName = `Livro_Diario_Reserva_PMDF_${yyyy}-${mm}-${dd}.docx`;

  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

  if (isTauri) {
    alert(
      'AVISO INSTITUCIONAL: Em conformidade com as diretrizes de segurança da PMDF, utilize a opção [Salvar / Imprimir PDF] para emitir a Ata de Passagem de Serviço oficial com fé pública.\n\nA exportação em formato Word (.docx) está disponível ao acessar o sistema via navegador.'
    );
    return;
  }

  // Geração do arquivo e download no navegador
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
