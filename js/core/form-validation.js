// form-validation.js
// Sistema de validación de formularios inline con mensajes de error
// Depende de: notify-ui.js (notify)

const FormValidation = {
  // Reglas de validación predefinidas
  rules: {
    required: (value) => {
      if (typeof value === 'string') value = value.trim();
      return value !== '' && value !== null && value !== undefined;
    },
    min: (value, min) => {
      const num = parseFloat(value);
      return !isNaN(num) && num >= min;
    },
    max: (value, max) => {
      const num = parseFloat(value);
      return !isNaN(num) && num <= max;
    },
    minLength: (value, min) => {
      return String(value).length >= min;
    },
    maxLength: (value, max) => {
      return String(value).length <= max;
    },
    email: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    phone: (value) => {
      // Acepta formatos cubanos: +53 5 1234567, 5-1234567, 51234567
      const phoneRegex = /^(\+53\s?)?(\d{1,3}[-]?)?\d{7,8}$/;
      return phoneRegex.test(value.replace(/\s/g, ''));
    },
    positive: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num > 0;
    },
    nonNegative: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num >= 0;
    }
  },

  // Validar un campo específico
  validateField(value, fieldRules) {
    const errors = [];
    
    if (!Array.isArray(fieldRules)) {
      fieldRules = [fieldRules];
    }

    for (const rule of fieldRules) {
      if (typeof rule === 'string') {
        // Regla predefinida por nombre
        if (this.rules[rule]) {
          if (!this.rules[rule](value)) {
            errors.push(this.getErrorMessage(rule));
          }
        }
      } else if (typeof rule === 'function') {
        // Función de validación custom
        const result = rule(value);
        if (result !== true) {
          errors.push(result || 'Valor inválido');
        }
      } else if (typeof rule === 'object') {
        // Regla con parámetros
        const { type, param, message } = rule;
        if (this.rules[type]) {
          if (!this.rules[type](value, param)) {
            errors.push(message || this.getErrorMessage(type, param));
          }
        }
      }
    }

    return errors;
  },

  // Validar un formulario completo
  validateForm(formData, schema) {
    const errors = {};
    let isValid = true;

    for (const [fieldName, fieldRules] of Object.entries(schema)) {
      const value = formData[fieldName];
      const fieldErrors = this.validateField(value, fieldRules);
      
      if (fieldErrors.length > 0) {
        errors[fieldName] = fieldErrors;
        isValid = false;
      }
    }

    return { isValid, errors };
  },

  // Mostrar errores en el DOM
  showErrors(errors, formElement) {
    // Limpiar errores anteriores
    this.clearErrors(formElement);

    for (const [fieldName, fieldErrors] of Object.entries(errors)) {
      const field = formElement.querySelector(`[name="${fieldName}"]`) ||
                   formElement.querySelector(`#${fieldName}`);
      
      if (field) {
        // Crear contenedor de errores
        let errorContainer = field.parentElement.querySelector('.field-errors');
        if (!errorContainer) {
          errorContainer = document.createElement('div');
          errorContainer.className = 'field-errors';
          field.parentElement.appendChild(errorContainer);
        }

        // Agregar estilos de error al campo
        field.classList.add('field-error');

        // Mostrar mensajes de error
        fieldErrors.forEach(errorMsg => {
          const errorElement = document.createElement('div');
          errorElement.className = 'error-message';
          errorElement.textContent = errorMsg;
          errorContainer.appendChild(errorElement);
        });
      }
    }
  },

  // Limpiar errores del formulario
  clearErrors(formElement) {
    const errorMessages = formElement.querySelectorAll('.error-message');
    errorMessages.forEach(el => el.remove());

    const errorContainers = formElement.querySelectorAll('.field-errors');
    errorContainers.forEach(el => {
      if (el.children.length === 0) el.remove();
    });

    const errorFields = formElement.querySelectorAll('.field-error');
    errorFields.forEach(el => el.classList.remove('field-error'));
  },

  // Obtener mensaje de error predefinido
  getErrorMessage(ruleType, param) {
    const messages = {
      required: 'Este campo es obligatorio',
      min: `El valor debe ser al menos ${param}`,
      max: `El valor debe ser como máximo ${param}`,
      minLength: `Mínimo ${param} caracteres requeridos`,
      maxLength: `Máximo ${param} caracteres permitidos`,
      email: 'Ingresa un email válido',
      phone: 'Ingresa un número de teléfono válido',
      positive: 'El valor debe ser positivo',
      nonNegative: 'El valor no puede ser negativo'
    };
    return messages[ruleType] || 'Valor inválido';
  },

  // Configurar validación en tiempo real para un formulario
  setupRealTimeValidation(formElement, schema) {
    const inputs = formElement.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        const fieldName = input.name || input.id;
        if (schema[fieldName]) {
          const value = input.value;
          const errors = this.validateField(value, schema[fieldName]);
          
          // Actualizar visualización de errores
          const errorContainer = input.parentElement.querySelector('.field-errors');
          if (errorContainer) {
            errorContainer.innerHTML = '';
            if (errors.length > 0) {
              input.classList.add('field-error');
              errors.forEach(errorMsg => {
                const errorElement = document.createElement('div');
                errorElement.className = 'error-message';
                errorElement.textContent = errorMsg;
                errorContainer.appendChild(errorElement);
              });
            } else {
              input.classList.remove('field-error');
            }
          }
        }
      });

      input.addEventListener('blur', () => {
        const fieldName = input.name || input.id;
        if (schema[fieldName]) {
          const value = input.value;
          const errors = this.validateField(value, schema[fieldName]);
          
          if (errors.length > 0) {
            const errorContainer = input.parentElement.querySelector('.field-errors');
            if (!errorContainer) {
              const newContainer = document.createElement('div');
              newContainer.className = 'field-errors';
              input.parentElement.appendChild(newContainer);
            }
            
            input.classList.add('field-error');
            const container = input.parentElement.querySelector('.field-errors');
            container.innerHTML = '';
            errors.forEach(errorMsg => {
              const errorElement = document.createElement('div');
              errorElement.className = 'error-message';
              errorElement.textContent = errorMsg;
              container.appendChild(errorElement);
            });
          } else {
            input.classList.remove('field-error');
            const errorContainer = input.parentElement.querySelector('.field-errors');
            if (errorContainer) errorContainer.remove();
          }
        }
      });
    });
  }
};

// Agregar estilos CSS para los errores (si no existen)
if (typeof document !== 'undefined') {
  const styleId = 'form-validation-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .field-error {
        border-color: #f2555f !important;
        box-shadow: 0 0 0 2px rgba(242, 85, 95, 0.2) !important;
      }
      .field-errors {
        margin-top: 4px;
        font-size: 0.75rem;
        color: #f2555f;
      }
      .error-message {
        margin-bottom: 2px;
      }
      .field-errors:empty {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }
}