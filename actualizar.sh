#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== ACTUALIZANDO REPOSITORIO AdminRed ===${NC}"

# Cambiar al directorio correcto
cd /storage/emulated/0/Download/AdminRed-main-fix/AdminRed-main || exit 1

echo -e "${YELLOW}Directorio actual: $(pwd)${NC}"

# Verificar si es git
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Inicializando repositorio git...${NC}"
    git init
    git remote add origin https://github.com/leolhf/AdminRed.git
fi

# Configurar usuario
git config user.name "leolhf"
git config user.email "hfleo975@gmail.com"

# Añadir archivos
echo -e "${YELLOW}Añadiendo archivos...${NC}"
git add .

# Verificar cambios
if git diff --cached --quiet; then
    echo -e "${YELLOW}No hay cambios nuevos que commitear (puede que ya estén commiteados de un intento anterior que falló al subir).${NC}"
else
    # Commit
    echo -e "${YELLOW}Haciendo commit...${NC}"
    git commit -m "Actualización automática: $(date '+%Y-%m-%d %H:%M:%S')"
fi

# Subir (se intenta siempre, aunque no haya habido commit nuevo, por si un push
# anterior falló por conexión y quedó un commit local pendiente de subir)
echo -e "${YELLOW}Subiendo al repositorio...${NC}"
git push -u origin main --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Actualización completada exitosamente${NC}"
else
    echo -e "${RED}✗ Error al subir.${NC}"
    echo -e "${YELLOW}Configura token:${NC}"
    echo "git remote set-url origin https://TOKEN@github.com/leolhf/AdminRed.git"
fi
