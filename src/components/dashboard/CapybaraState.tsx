import capybaraLoading from '@/assets/capybara-loading.png';
import capybaraEmpty from '@/assets/capybara-empty.png';

interface CapybaraStateProps {
  type: 'loading' | 'empty' | 'success' | 'error';
  title?: string;
  description?: string;
  className?: string;
}

export function CapybaraState({ type, title, description, className }: CapybaraStateProps) {
  const defaults = {
    loading: {
      title: 'Loading your dashboard...',
      description: 'Hang tight, our capybara is gathering your data',
      image: capybaraLoading,
    },
    empty: {
      title: 'All clear!',
      description: 'Nothing to show here right now',
      image: capybaraEmpty,
    },
    success: {
      title: 'All tasks complete!',
      description: 'Great work — take a well-deserved break',
      image: capybaraEmpty,
    },
    error: {
      title: 'Something went wrong',
      description: 'Please try refreshing the page',
      image: capybaraLoading,
    },
  };

  const config = defaults[type];

  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center animate-fade-in ${className || ''}`}>
      <img
        src={config.image}
        alt={type}
        className="h-32 w-32 md:h-40 md:w-40 object-contain mb-6 drop-shadow-lg"
      />
      <h3 className="text-xl font-bold text-foreground mb-2">
        {title || config.title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {description || config.description}
      </p>
    </div>
  );
}